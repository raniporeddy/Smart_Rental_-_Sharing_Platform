import re
import secrets
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Booking, Payment, Product
from ..utils import booking_json, current_user_id, error, json_body, new_confirmation_token, notify

bp = Blueprint("payments", __name__, url_prefix="/api/payments")
UPI_PATTERN = re.compile(r"^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$")


@bp.post("/orders/<int:booking_id>")
@jwt_required()
def create_order(booking_id):
    booking = Booking.query.filter_by(id=booking_id).with_for_update().first()
    if not booking:
        return error("Booking not found", 404)
    if current_user_id() != booking.renter_id:
        return error("Only the renter can pay for this booking", 403)
    if booking.status != "Approved":
        return error("Payment is available only for approved bookings", 409)
    existing = Payment.query.filter_by(booking_id=booking.id, payment_status="Pending").first()
    if not existing:
        existing = Payment(booking_id=booking.id, transaction_id=f"SIM-{secrets.token_hex(12).upper()}",
                          confirmation_token=new_confirmation_token(), payment_method="UPI",
                          rental_paid=0, deposit_paid=0, total_paid=0, payment_status="Pending")
        db.session.add(existing)
        db.session.commit()
    return jsonify({"order": {"payment_id": existing.id, "booking_id": booking.id, "transaction_id": existing.transaction_id,
                              "rental_amount": float(booking.rental_amount),
                              "security_deposit": float(booking.deposit_amount),
                              "total_payable": float(booking.total_payable),
                              "currency": "INR", "payment_status": existing.payment_status,
                              "confirmation_token": existing.confirmation_token}})


def verify_payment(require_upi):
    data = json_body()
    token = data.get("confirmation_token", "")
    if not isinstance(token, str) or not token:
        return error("confirmation_token is required to confirm payment", 400)
    if require_upi:
        upi_id = data.get("upi_id", "")
        if not isinstance(upi_id, str) or not UPI_PATTERN.fullmatch(upi_id):
            return error("upi_id must use the format user@bank", 400)
    try:
        payment_id = int(data.get("payment_id"))
    except (ValueError, TypeError):
        return error("payment_id is required", 400)
    payment = Payment.query.filter_by(id=payment_id).with_for_update().first()
    if not payment:
        return error("Payment not found", 404)
    booking = Booking.query.filter_by(id=payment.booking_id).with_for_update().first()
    if not booking:
        return error("Booking not found", 404)
    if current_user_id() != booking.renter_id:
        return error("Only the renter can verify this payment", 403)
    if not secrets.compare_digest(payment.confirmation_token or "", token):
        return error("Transaction confirmation token is invalid", 400)
    if payment.payment_status == "Verified" and booking.status == "Confirmed":
        return jsonify({"payment_status": "Verified", "booking": booking_json(booking), "message": "Payment already verified"})
    if payment.payment_status != "Pending" or booking.status != "Approved":
        return error("Payment or booking is not in a payable state", 409)
    product = Product.query.filter_by(id=booking.product_id).with_for_update().first()
    if not product or not product.is_available or not product.is_approved or product.is_removed or product.is_flagged_fraud:
        db.session.rollback()
        return error("Product is no longer available for payment", 409)
    overlap = Booking.query.filter(Booking.product_id == booking.product_id,
                                   Booking.id != booking.id,
                                   Booking.status.in_(["Confirmed", "Active"]),
                                   Booking.start_date <= booking.return_date,
                                   Booking.return_date >= booking.start_date).first()
    if overlap:
        db.session.rollback()
        return error("The product is already booked for overlapping dates", 409)
    if require_upi:
        payment.payment_method = "UPI"
    else:
        method = data.get("payment_method", payment.payment_method)
        if method not in {"UPI", "Card", "NetBanking"}:
            return error("payment_method must be UPI, Card, or NetBanking", 400)
        payment.payment_method = method
    payment.payment_status = "Verified"
    payment.rental_paid = booking.rental_amount
    payment.deposit_paid = booking.deposit_amount
    payment.total_paid = booking.total_payable
    payment.paid_at = datetime.utcnow()
    booking.status = "Confirmed"
    notify(booking.renter_id, "Payment verified", "Your booking is confirmed.", "payment")
    notify(booking.owner_id, "Booking confirmed", "The renter's payment was verified.", "payment")
    db.session.commit()
    return jsonify({"payment_status": payment.payment_status, "transaction_id": payment.transaction_id,
                    "booking": booking_json(booking)})


@bp.post("/verify-upi")
@jwt_required()
def verify_upi():
    return verify_payment(True)


@bp.post("/verify")
@jwt_required()
def verify_gateway():
    return verify_payment(False)


@bp.get("/booking/<int:booking_id>")
@jwt_required()
def get_booking_payment(booking_id):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return error("Booking not found", 404)
    if current_user_id() not in (booking.renter_id, booking.owner_id):
        return error("Booking access denied", 403)
    payment = Payment.query.filter_by(booking_id=booking.id).order_by(Payment.id.desc()).first()
    if not payment:
        return jsonify({"payment": None})
    return jsonify({"payment": {"id": payment.id, "transaction_id": payment.transaction_id,
                                 "payment_method": payment.payment_method,
                                 "rental_paid": float(payment.rental_paid),
                                 "deposit_paid": float(payment.deposit_paid),
                                 "total_paid": float(payment.total_paid),
                                 "payment_status": payment.payment_status,
                                 "paid_at": payment.paid_at.isoformat() if payment.paid_at else None}})


@bp.get("/history")
@jwt_required()
def payment_history():
    side = request.args.get("side", "renter")
    user_id = current_user_id()
    query = db.session.query(Payment, Booking).join(Booking, Booking.id == Payment.booking_id)
    if side == "owner":
        query = query.filter(Booking.owner_id == user_id)
    else:
        query = query.filter(Booking.renter_id == user_id)
    rows = query.order_by(Payment.id.desc()).limit(500).all()
    return jsonify({"items": [{"id": payment.id, "booking_id": booking.id,
                               "transaction_id": payment.transaction_id,
                               "payment_method": payment.payment_method,
                               "rental_paid": float(payment.rental_paid),
                               "deposit_paid": float(payment.deposit_paid),
                               "total_paid": float(payment.total_paid),
                               "payment_status": payment.payment_status,
                               "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
                               "booking_status": booking.status} for payment, booking in rows]})


@bp.get("/earnings")
@jwt_required()
def owner_earnings():
    from sqlalchemy import func
    from ..models import RentalHistory

    user_id = current_user_id()
    rental_total = (db.session.query(func.coalesce(func.sum(Payment.rental_paid), 0))
                    .join(Booking, Booking.id == Payment.booking_id)
                    .filter(Booking.owner_id == user_id, Payment.payment_status == "Verified").scalar())
    deposit_total = (db.session.query(func.coalesce(func.sum(Payment.deposit_paid), 0))
                     .join(Booking, Booking.id == Payment.booking_id)
                     .filter(Booking.owner_id == user_id, Payment.payment_status == "Verified").scalar())
    active_rentals = Booking.query.filter_by(owner_id=user_id, status="Active").count()
    returned_count = RentalHistory.query.filter_by(owner_id=user_id).count()
    return jsonify({"verified_rental_earnings": float(rental_total or 0),
                    "deposits_held": float(deposit_total or 0),
                    "active_rentals": active_rentals, "completed_rentals": returned_count})
