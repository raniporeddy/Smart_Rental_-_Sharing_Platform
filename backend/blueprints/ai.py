from datetime import date
import re

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func, or_

from ..ai_engine import AI_ENGINE
from ..extensions import db
from ..models import Booking, Category, PlatformPolicy, Product
from ..utils import error, product_json

bp = Blueprint("ai", __name__, url_prefix="/api/ai")


def find_category(value):
    if value is None:
        return None
    text = str(value).strip()
    if text.isdigit():
        return db.session.get(Category, int(text))
    return Category.query.filter(func.lower(Category.name) == text.lower()).first()


@bp.post("/predict-price")
@jwt_required()
def predict_price():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    category = find_category(data.get("category_id", data.get("category")))
    subcategory = find_category(data.get("subcategory_id", data.get("subcategory"))) if data.get("subcategory_id", data.get("subcategory")) else None
    if not category:
        return error("A valid category or category_id is required", 400)
    if category.parent_category:
        if subcategory and subcategory.id != category.id:
            return error("A category_id that names a subcategory cannot be combined with a different subcategory", 400)
        subcategory = category
        category = db.session.get(Category, category.parent_category)
    if subcategory and subcategory.parent_category != category.id:
        return error("subcategory must belong to the selected category", 400)
    condition = data.get("condition_status", "Good")
    try:
        retail = float(data.get("estimated_retail_value"))
        prediction = AI_ENGINE.predict_price(category.name,
                                            subcategory.name if subcategory else category.name,
                                            condition, retail)
    except (TypeError, ValueError) as exc:
        return error(str(exc), 400)
    return jsonify({**prediction, "category_id": category.id,
                    "subcategory_id": subcategory.id if subcategory else None,
                    "condition_status": condition,
                    "model": "RandomForestRegressor"})


@bp.post("/classify-image")
@jwt_required()
def classify_image():
    image = request.files.get("image")
    if not image or not image.filename:
        return error("An image file is required in the image field", 400)
    try:
        result = AI_ENGINE.classify_image(image)
    except ValueError as exc:
        return error(str(exc), 400)
    return jsonify(result)


@bp.get("/recommendations")
@jwt_required(optional=True)
def recommendations():
    user_id = get_jwt_identity()
    user_id = int(user_id) if user_id else None
    try:
        limit = min(30, max(1, request.args.get("limit", 12, type=int)))
    except (ValueError, TypeError):
        limit = 12
    rows = AI_ENGINE.recommend(user_id=user_id, limit=limit)
    return jsonify({"items": [{"product": product_json(row["product"]),
                               "score": row["score"], "reason": row["reason"]} for row in rows],
                    "personalized": user_id is not None,
                    "strategy": "content + collaborative + trending" if user_id else "top-rated + trending"})


@bp.post("/chat")
@jwt_required(optional=True)
def chat():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("message"), str):
        return error("message is required", 400)
    question = data["message"].strip()
    if not question or len(question) > 1000:
        return error("message must contain 1 to 1000 characters", 400)
    lower = question.lower()
    tokens = [word for word in re.findall(r"[a-z0-9]{3,}", lower)
              if word not in {"the", "and", "for", "can", "you", "what", "how", "does", "are", "with", "from", "show", "find", "available", "availability", "rent", "rental", "item", "items"}]
    products_query = Product.query.filter_by(is_available=True, is_approved=True,
                                             is_removed=False, is_flagged_fraud=False)
    if tokens:
        conditions = [column.ilike(f"%{token}%") for token in tokens[:6]
                      for column in (Product.title, Product.description, Product.location)]
        products_query = products_query.filter(or_(*conditions))
    start = end = None
    if data.get("start_date") or data.get("end_date"):
        try:
            start = date.fromisoformat(data["start_date"])
            end = date.fromisoformat(data["end_date"])
        except (KeyError, TypeError, ValueError):
            return error("Provide both start_date and end_date as YYYY-MM-DD", 400)
        if end < start:
            return error("end_date must be on or after start_date", 400)
        products_query = products_query.filter(
            or_(Product.available_from.is_(None), Product.available_from <= start),
            or_(Product.available_to.is_(None), Product.available_to >= end))
        conflict = db.session.query(Booking.id).filter(
            Booking.product_id == Product.id, Booking.status.in_(["Confirmed", "Active"]),
            Booking.start_date <= end, Booking.return_date >= start).exists()
        products_query = products_query.filter(~conflict)
    matches = products_query.order_by(Product.created_at.desc()).limit(5).all()
    policies = {row.policy_key: row.policy_value for row in PlatformPolicy.query.all()}
    answer_parts = []
    lower_tokens = set(tokens)
    if {"deposit", "refund", "refundable", "security"} & lower_tokens:
        answer_parts.append(policies.get("deposit_refund", "Deposit terms are not configured."))
    if {"cancel", "cancellation"} & lower_tokens:
        answer_parts.append(policies.get("cancellation", "Cancellation policy is not configured."))
    if {"approve", "approval", "booking", "bookings", "handover"} & lower_tokens:
        answer_parts.append(policies.get("booking_workflow", "Booking policy is not configured."))
    if {"late", "penalty", "overdue"} & lower_tokens:
        answer_parts.append(policies.get("late_return", "Late return policy is not configured."))
    availability_intent = any(word in lower for word in ("available", "availability", "rent", "looking for", "find me", "need a"))
    if availability_intent or start or matches and tokens:
        if matches:
            answer_parts.append("Matching live listings" + (f" for {start} through {end}" if start else "") +
                                (":" if start else ". Provide start_date and end_date to check exact booking availability."))
        else:
            answer_parts.append("I could not find an available approved listing matching those details. Try another item name or location.")
    user_id = get_jwt_identity()
    active_bookings = []
    if user_id:
        active_bookings = (Booking.query.filter(
            (Booking.renter_id == int(user_id)) | (Booking.owner_id == int(user_id)),
            Booking.status.in_(["Pending", "Approved", "Confirmed", "Active"]))
            .order_by(Booking.created_at.desc()).limit(5).all())
        if "my" in lower or {"booking", "status"} & lower_tokens:
            if active_bookings:
                answer_parts.append("Your current booking statuses: " + ", ".join(
                    f"#{booking.id} {booking.status}" for booking in active_bookings) + ".")
            else:
                answer_parts.append("You have no pending or active bookings.")
    elif "my" in lower and {"booking", "status"} & lower_tokens:
        answer_parts.append("Sign in to view your booking status.")
    if not answer_parts:
        answer_parts.append("I can check live listings, booking steps, security deposit rules, late return policy, and your current bookings. Ask about an item or policy.")
    return jsonify({"answer": " ".join(answer_parts),
                    "products": [product_json(product) for product in matches],
                    "active_bookings": [{"id": booking.id, "status": booking.status,
                                         "start_date": booking.start_date.isoformat(),
                                         "return_date": booking.return_date.isoformat()} for booking in active_bookings],
                    "policies_used": list(policies)})
