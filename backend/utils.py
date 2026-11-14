import hashlib
import secrets
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import bcrypt
from flask import jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity

from .extensions import db
from .models import Notification


def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_password(password, password_hash):
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def current_user_id():
    return int(get_jwt_identity())


def admin_required():
    return get_jwt().get("role") == "admin"


def error(message, status):
    return jsonify({"error": message}), status


def json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def notify(user_id, title, message, kind):
    db.session.add(Notification(user_id=user_id, title=title, message=message, type=kind))


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def parse_date(value, field):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be an ISO date (YYYY-MM-DD)")


def parse_money(value, field, default=None):
    if value is None and default is not None:
        return Decimal(str(default))
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValueError(f"{field} must be a valid amount")
    if not amount.is_finite() or amount < 0:
        raise ValueError(f"{field} must be a non-negative amount")
    return amount.quantize(Decimal("0.01"))


def new_confirmation_token():
    return secrets.token_urlsafe(36)


def iso(value):
    return value.isoformat() if isinstance(value, (date, datetime)) else value


def user_json(user):
    return {"id": user.id, "full_name": user.full_name, "email": user.email,
            "phone": user.phone, "role": user.role, "location": user.location,
            "avatar_url": user.avatar_url, "is_active": user.is_active,
            "created_at": iso(user.created_at)}


def product_json(product):
    return {"id": product.id, "owner_id": product.owner_id, "category_id": product.category_id,
            "title": product.title, "description": product.description,
            "price_per_day": float(product.price_per_day), "security_deposit": float(product.security_deposit),
            "location": product.location, "condition_status": product.condition_status,
            "available_from": iso(product.available_from), "available_to": iso(product.available_to),
            "is_available": product.is_available, "is_flagged_fraud": product.is_flagged_fraud,
            "fraud_reason": product.fraud_reason, "is_approved": product.is_approved,
            "is_removed": product.is_removed,
            "created_at": iso(product.created_at),
            "images": [{"id": im.id, "image_url": im.image_url, "is_primary": im.is_primary} for im in product.images]}


def booking_json(booking):
    return {"id": booking.id, "product_id": booking.product_id,
            "product_title": booking.product.title if booking.product else None,
            "renter_id": booking.renter_id,
            "owner_id": booking.owner_id, "start_date": iso(booking.start_date),
            "return_date": iso(booking.return_date), "actual_return_date": iso(booking.actual_return_date),
            "total_days": booking.total_days, "rental_amount": float(booking.rental_amount),
            "deposit_amount": float(booking.deposit_amount), "total_payable": float(booking.total_payable),
            "status": booking.status, "is_suspicious": booking.is_suspicious,
            "suspicion_reason": booking.suspicion_reason,
            "created_at": iso(booking.created_at)}
