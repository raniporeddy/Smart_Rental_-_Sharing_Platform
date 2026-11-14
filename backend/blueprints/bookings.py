from datetime import date, datetime, timedelta
from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..ai_engine import AI_ENGINE
from ..extensions import db
from ..models import Booking, Payment, Product, RentalHistory, User
from ..utils import booking_json, current_user_id, error, json_body, notify, parse_date

bp = Blueprint("bookings", __name__, url_prefix="/api/bookings")
BLOCKING_STATUSES = ("Confirmed", "Active")


def has_overlap(product_id, start, end, exclude_id=None):
    query = Booking.query.filter(Booking.product_id == product_id,
                                 Booking.status.in_(BLOCKING_STATUSES),
                                 Booking.start_date <= end, Booking.return_date >= start)
    if exclude_id is not None:
        query = query.filter(Booking.id != exclude_id)
    return query.first() is not None


def load_booking(booking_id, lock=False):
    query = Booking.query.filter_by(id=booking_id)
    return (query.with_for_update() if lock else query).first()


@bp.post("/request")
@jwt_required()
def request_booking():
    data = json_body()
    try:
        product_id = int(data.get("product_id"))
        start = parse_date(data.get("start_date"), "start_date")
        end = parse_date(data.get("return_date"), "return_date")
    except (ValueError, TypeError) as exc:
        return error(str(exc), 400)
    if end < start or start < date.today():
        return error("Dates must be valid, future/current dates and return_date cannot precede start_date", 400)
    product = Product.query.filter_by(id=product_id, is_available=True, is_approved=True,
                                      is_removed=False, is_flagged_fraud=False).with_for_update().first()
    if not product:
        return error("Product not found or unavailable", 404)
    renter_id = current_user_id()
    if renter_id == product.owner_id:
        return error("You cannot book your own product", 400)
    if product.available_from and start < product.available_from or product.available_to and end > product.available_to:
        return error("Requested dates fall outside the product availability window", 409)
    if has_overlap(product.id, start, end):
        db.session.rollback()
        return error("The product is already booked for overlapping dates", 409)
    days = (end - start).days + 1
    rental = (Decimal(product.price_per_day) * days).quantize(Decimal("0.01"))
    deposit = Decimal(product.security_deposit).quantize(Decimal("0.01"))
    recent_count = Booking.query.filter(Booking.renter_id == renter_id,
                                        Booking.created_at >= datetime.utcnow() - timedelta(minutes=10)).count()
    suspicion = AI_ENGINE.assess_booking_velocity(recent_count, (start - date.today()).days,
                                                  days, float(rental + deposit))
    booking = Booking(product_id=product.id, renter_id=renter_id, owner_id=product.owner_id,
                      start_date=start, return_date=end, total_days=days, rental_amount=rental,
                      deposit_amount=deposit, total_payable=rental + deposit, status="Pending",
                      is_suspicious=bool(suspicion), suspicion_reason=suspicion)
    db.session.add(booking)
    notify(product.owner_id, "New booking request", f"A renter requested {product.title}.", "booking")
    if suspicion:
        for admin in User.query.filter_by(role="admin", is_active=True).all():
            notify(admin.id, "Booking flagged for review", f"Booking risk for product {product.id}: {suspicion}", "fraud_review")
    db.session.commit()
    return jsonify({"booking": booking_json(booking)}), 201


@bp.get("")
@jwt_required()
def list_bookings():
    user_id = current_user_id()
    side = request.args.get("side", "all")
    query = Booking.query
    if side == "renter":
        query = query.filter_by(renter_id=user_id)
    elif side == "owner":
        query = query.filter_by(owner_id=user_id)
    else:
        query = query.filter((Booking.renter_id == user_id) | (Booking.owner_id == user_id))
    return jsonify({"items": [booking_json(b) for b in query.order_by(Booking.created_at.desc()).all()]})


@bp.get("/history")
@jwt_required()
def rental_history():
    user_id = current_user_id()
    side = request.args.get("side", "all")
    query = db.session.query(RentalHistory, Product.title).join(Product, Product.id == RentalHistory.product_id)
    if side == "renter":
        query = query.filter(RentalHistory.renter_id == user_id)
    elif side == "owner":
        query = query.filter(RentalHistory.owner_id == user_id)
    else:
        query = query.filter((RentalHistory.renter_id == user_id) | (RentalHistory.owner_id == user_id))
    rows = query.order_by(RentalHistory.completed_at.desc()).all()
    return jsonify({"items": [{"booking_id": row.booking_id, "product_id": row.product_id,
                               "product_title": title, "side": "renter" if row.renter_id == user_id else "owner",
                               "completed_at": row.completed_at.isoformat(), "late_days": row.late_days,
                               "penalty_amount": float(row.penalty_amount)} for row, title in rows]})


@bp.get("/<int:booking_id>")
@jwt_required()
def get_booking(booking_id):
    booking = load_booking(booking_id)
    if not booking:
        return error("Booking not found", 404)
    if current_user_id() not in (booking.renter_id, booking.owner_id):
        return error("Booking access denied", 403)
    return jsonify({"booking": booking_json(booking)})


@bp.put("/<int:booking_id>/respond")
@jwt_required()
def respond(booking_id):
    booking = load_booking(booking_id, lock=True)
    if not booking:
        return error("Booking not found", 404)
    if current_user_id() != booking.owner_id:
        return error("Only the owner can respond", 403)
    if booking.status != "Pending":
        return error("Only pending requests can be answered", 409)
    action = json_body().get("action", "")
    action = action.lower() if isinstance(action, str) else ""
    if action not in {"approve", "reject"}:
        return error("action must be approve or reject", 400)
    product = Product.query.filter_by(id=booking.product_id).with_for_update().first()
    if action == "approve":
        if has_overlap(booking.product_id, booking.start_date, booking.return_date, booking.id):
            db.session.rollback()
            return error("The product is already booked for overlapping dates", 409)
        booking.status = "Approved"
        message, title = "Your booking request was approved", "Booking approved"
    else:
        booking.status = "Rejected"
        message, title = "Your booking request was rejected", "Booking rejected"
    notify(booking.renter_id, title, message, "booking")
    db.session.commit()
    return jsonify({"booking": booking_json(booking)})


@bp.put("/<int:booking_id>/cancel")
@jwt_required()
def cancel_booking(booking_id):
    booking = load_booking(booking_id, lock=True)
    if not booking:
        return error("Booking not found", 404)
    if current_user_id() != booking.renter_id:
        return error("Only the renter can cancel this booking", 403)
    if booking.status not in {"Pending", "Approved"}:
        return error("Only pending or approved unpaid bookings can be cancelled", 409)
    booking.status = "Cancelled"
    for payment in Payment.query.filter_by(booking_id=booking.id, payment_status="Pending").all():
        payment.payment_status = "Failed"
        payment.confirmation_token = None
    notify(booking.owner_id, "Booking cancelled", "The renter cancelled the booking request.", "booking")
    db.session.commit()
    return jsonify({"booking": booking_json(booking)})


@bp.put("/<int:booking_id>/handover")
@jwt_required()
def handover(booking_id):
    booking = load_booking(booking_id, lock=True)
    if not booking:
        return error("Booking not found", 404)
    if current_user_id() != booking.owner_id:
        return error("Only the owner can record handover", 403)
    if booking.status != "Confirmed":
        return error("Only confirmed bookings can be handed over", 409)
    if date.today() < booking.start_date:
        return error("The scheduled start date has not arrived", 409)
    booking.status = "Active"
    notify(booking.renter_id, "Rental started", "The owner recorded the item handover.", "booking")
    db.session.commit()
    return jsonify({"booking": booking_json(booking)})


@bp.put("/<int:booking_id>/return")
@jwt_required()
def return_item(booking_id):
    booking = load_booking(booking_id, lock=True)
    if not booking:
        return error("Booking not found", 404)
    if current_user_id() not in (booking.owner_id, booking.renter_id):
        return error("Booking access denied", 403)
    if booking.status != "Active":
        return error("Only active bookings can be returned", 409)
    data = json_body()
    try:
        actual = parse_date(data.get("actual_return_date", date.today().isoformat()), "actual_return_date")
    except ValueError as exc:
        return error(str(exc), 400)
    late_days = max(0, (actual - booking.return_date).days)
    if actual > date.today():
        return error("actual_return_date cannot be in the future", 400)
    product = db.session.get(Product, booking.product_id)
    multiplier = Decimal(str(current_app.config["LATE_PENALTY_MULTIPLIER"]))
    if multiplier < 0:
        return error("Late penalty configuration is invalid", 500)
    penalty = (Decimal(product.price_per_day) * multiplier * late_days).quantize(Decimal("0.01"))
    booking.actual_return_date = actual
    booking.status = "Returned"
    history = RentalHistory(booking_id=booking.id, product_id=booking.product_id,
                            renter_id=booking.renter_id, owner_id=booking.owner_id,
                            completed_at=db.func.now(), late_days=late_days, penalty_amount=penalty)
    db.session.add(history)
    notify(booking.renter_id, "Item returned", "The return was recorded and a review is now available.", "booking")
    notify(booking.owner_id, "Item returned", "The return was recorded.", "booking")
    if late_days:
        booking.is_suspicious = True
        notify(booking.owner_id, "Late return recorded", f"The item was returned {late_days} day(s) late.", "late_return")
        notify(booking.renter_id, "Late return recorded", f"The return was {late_days} day(s) late; penalty: {penalty}.", "late_return")
    db.session.commit()
    return jsonify({"booking": booking_json(booking), "late_days": late_days, "penalty_amount": float(penalty)})
