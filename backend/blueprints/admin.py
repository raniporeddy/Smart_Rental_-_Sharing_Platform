from decimal import Decimal

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, or_

from ..authz import admin_required
from ..extensions import db
from ..models import Booking, Category, Complaint, Payment, Product, User
from ..utils import booking_json, current_user_id, error, json_body, notify, product_json, user_json

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@bp.get("/stats")
@jwt_required()
@admin_required
def stats():
    verified_revenue = db.session.query(func.coalesce(func.sum(Payment.total_paid), 0)).filter_by(payment_status="Verified").scalar()
    return jsonify({"users": User.query.count(), "active_users": User.query.filter_by(is_active=True).count(),
                    "products": Product.query.filter_by(is_removed=False).count(),
                    "pending_product_approval": Product.query.filter_by(is_approved=False, is_removed=False).count(),
                    "flagged_products": Product.query.filter_by(is_flagged_fraud=True, is_removed=False).count(),
                    "bookings": Booking.query.count(),
                    "active_bookings": Booking.query.filter_by(status="Active").count(),
                    "pending_bookings": Booking.query.filter_by(status="Pending").count(),
                    "suspicious_bookings": Booking.query.filter_by(is_suspicious=True).count(),
                    "open_complaints": Complaint.query.filter(Complaint.status != "Resolved").count(),
                    "verified_payment_total": float(verified_revenue or Decimal("0"))})


@bp.get("/analytics")
@jwt_required()
@admin_required
def analytics():
    monthly_rows = (db.session.query(func.date_format(Payment.paid_at, "%Y-%m").label("month"),
                                     func.sum(Payment.rental_paid).label("revenue"))
                    .filter(Payment.payment_status == "Verified", Payment.paid_at.isnot(None))
                    .group_by("month").order_by("month").limit(24).all())
    category_rows = (db.session.query(Category.name, func.count(Product.id))
                     .outerjoin(Product, (Product.category_id == Category.id) & Product.is_removed.is_(False))
                     .filter(Category.parent_category.isnot(None)).group_by(Category.id, Category.name)
                     .order_by(func.count(Product.id).desc()).all())
    return jsonify({"monthly_revenue": [{"month": row.month, "revenue": float(row.revenue or 0)}
                                        for row in monthly_rows],
                    "category_distribution": [{"category": name, "listings": count}
                                               for name, count in category_rows]})


@bp.get("/users")
@jwt_required()
@admin_required
def users():
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, max(1, request.args.get("per_page", 50, type=int)))
    q = request.args.get("q", "").strip()
    query = User.query
    if q:
        query = query.filter(or_(User.email.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    pagination = query.order_by(User.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({"items": [user_json(u) for u in pagination.items], "total": pagination.total,
                    "page": page, "pages": pagination.pages})


def set_user_active(user_id, active):
    user = db.session.get(User, user_id)
    if not user:
        return error("User not found", 404)
    if user.id == current_user_id() and not active:
        return error("You cannot deactivate your own admin account", 400)
    user.is_active = active
    db.session.commit()
    return jsonify({"user": user_json(user)})


@bp.put("/users/<int:user_id>/ban")
@jwt_required()
@admin_required
def ban_user(user_id):
    return set_user_active(user_id, False)


@bp.put("/users/<int:user_id>/unban")
@jwt_required()
@admin_required
def unban_user(user_id):
    return set_user_active(user_id, True)


@bp.get("/products")
@jwt_required()
@admin_required
def products():
    query = Product.query.filter_by(is_removed=False)
    if request.args.get("pending") == "true":
        query = query.filter_by(is_approved=False)
    if request.args.get("flagged") == "true":
        query = query.filter_by(is_flagged_fraud=True)
    return jsonify({"items": [product_json(p) for p in query.order_by(Product.created_at.desc()).limit(500).all()]})


@bp.put("/products/<int:product_id>/approval")
@jwt_required()
@admin_required
def approve_product(product_id):
    product = db.session.get(Product, product_id)
    if not product or product.is_removed:
        return error("Product not found", 404)
    data = json_body()
    if not isinstance(data.get("is_approved"), bool):
        return error("is_approved must be a boolean", 400)
    product.is_approved = data["is_approved"]
    notify(product.owner_id, "Product moderation updated",
           "Your product listing was approved." if product.is_approved else "Your product listing was not approved.", "product")
    db.session.commit()
    return jsonify({"product": product_json(product)})


@bp.delete("/products/<int:product_id>")
@jwt_required()
@admin_required
def remove_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return error("Product not found", 404)
    product.is_removed = True
    product.is_available = False
    db.session.commit()
    return jsonify({"message": "Product removed"})


@bp.put("/products/<int:product_id>/fraud")
@jwt_required()
@admin_required
def review_fraud(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return error("Product not found", 404)
    data = json_body()
    if not isinstance(data.get("is_flagged_fraud"), bool):
        return error("is_flagged_fraud must be a boolean", 400)
    product.is_flagged_fraud = data["is_flagged_fraud"]
    product.fraud_reason = (data.get("fraud_reason") or "").strip() or None if product.is_flagged_fraud else None
    db.session.commit()
    return jsonify({"id": product.id, "is_flagged_fraud": product.is_flagged_fraud,
                    "fraud_reason": product.fraud_reason})


@bp.get("/complaints")
@jwt_required()
@admin_required
def complaints():
    status = request.args.get("status")
    query = Complaint.query
    if status in {"Open", "Investigating", "Resolved"}:
        query = query.filter_by(status=status)
    rows = query.order_by(Complaint.created_at.desc()).limit(500).all()
    return jsonify({"items": [{"id": c.id, "complainant_id": c.complainant_id,
                               "booking_id": c.booking_id, "subject": c.subject,
                               "description": c.description, "status": c.status,
                               "admin_notes": c.admin_notes, "created_at": c.created_at.isoformat()} for c in rows]})


@bp.put("/complaints/<int:complaint_id>")
@jwt_required()
@admin_required
def resolve_complaint(complaint_id):
    complaint = db.session.get(Complaint, complaint_id)
    if not complaint:
        return error("Complaint not found", 404)
    data = json_body()
    status = data.get("status", complaint.status)
    if status not in {"Open", "Investigating", "Resolved"}:
        return error("status must be Open, Investigating, or Resolved", 400)
    complaint.status = status
    if "admin_notes" in data:
        complaint.admin_notes = data["admin_notes"]
    db.session.commit()
    return jsonify({"id": complaint.id, "status": complaint.status, "admin_notes": complaint.admin_notes})


@bp.get("/suspicious-bookings")
@jwt_required()
@admin_required
def suspicious_bookings():
    rows = Booking.query.filter_by(is_suspicious=True).order_by(Booking.created_at.desc()).limit(500).all()
    return jsonify({"items": [booking_json(booking) for booking in rows]})


@bp.get("/bookings")
@jwt_required()
@admin_required
def all_bookings():
    status = request.args.get("status")
    query = Booking.query
    allowed_statuses = {"Pending", "Approved", "Rejected", "Confirmed", "Active", "Returned", "Completed", "Cancelled"}
    if status in allowed_statuses:
        query = query.filter_by(status=status)
    rows = query.order_by(Booking.created_at.desc()).limit(1000).all()
    return jsonify({"items": [booking_json(booking) for booking in rows]})


@bp.put("/bookings/<int:booking_id>/fraud-review")
@jwt_required()
@admin_required
def review_suspicious_booking(booking_id):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return error("Booking not found", 404)
    data = json_body()
    if not isinstance(data.get("is_suspicious"), bool):
        return error("is_suspicious must be a boolean", 400)
    booking.is_suspicious = data["is_suspicious"]
    if "suspicion_reason" in data:
        booking.suspicion_reason = data["suspicion_reason"] if booking.is_suspicious else None
    elif not booking.is_suspicious:
        booking.suspicion_reason = None
    db.session.commit()
    return jsonify({"id": booking.id, "is_suspicious": booking.is_suspicious,
                    "suspicion_reason": booking.suspicion_reason})


@bp.get("/categories")
def list_categories():
    rows = Category.query.order_by(Category.parent_category.isnot(None), Category.parent_category, Category.name).all()
    return jsonify({"items": [{"id": c.id, "name": c.name, "parent_category": c.parent_category,
                               "icon_name": c.icon_name} for c in rows]})


@bp.post("/categories")
@jwt_required()
@admin_required
def create_category():
    data = json_body()
    name = data.get("name", "").strip() if isinstance(data.get("name"), str) else ""
    if not name or len(name) > 100:
        return error("Category name must contain 1 to 100 characters", 400)
    parent_id = data.get("parent_category")
    try:
        parent_id = int(parent_id) if parent_id is not None else None
    except (ValueError, TypeError):
        return error("parent_category must be a category id", 400)
    if parent_id is not None and not db.session.get(Category, parent_id):
        return error("Parent category not found", 404)
    if parent_id is not None and db.session.get(Category, parent_id).parent_category is not None:
        return error("Subcategories must belong directly to a main category", 400)
    if Category.query.filter_by(parent_category=parent_id, name=name).first():
        return error("Category already exists at this level", 409)
    category = Category(name=name, parent_category=parent_id, icon_name=data.get("icon_name"))
    db.session.add(category)
    db.session.commit()
    return jsonify({"id": category.id, "name": category.name, "parent_category": category.parent_category,
                    "icon_name": category.icon_name}), 201


@bp.put("/categories/<int:category_id>")
@jwt_required()
@admin_required
def update_category(category_id):
    category = db.session.get(Category, category_id)
    if not category:
        return error("Category not found", 404)
    data = json_body()
    if "name" in data:
        name = data["name"].strip() if isinstance(data["name"], str) else ""
        if not name or len(name) > 100:
            return error("Category name must contain 1 to 100 characters", 400)
        duplicate = Category.query.filter(Category.parent_category == category.parent_category,
                                          Category.name == name, Category.id != category.id).first()
        if duplicate:
            return error("Category already exists at this level", 409)
        category.name = name
    if "icon_name" in data:
        category.icon_name = data["icon_name"]
    db.session.commit()
    return jsonify({"id": category.id, "name": category.name,
                    "parent_category": category.parent_category, "icon_name": category.icon_name})


@bp.delete("/categories/<int:category_id>")
@jwt_required()
@admin_required
def delete_category(category_id):
    category = db.session.get(Category, category_id)
    if not category:
        return error("Category not found", 404)
    descendant_ids = [row.id for row in Category.query.filter_by(parent_category=category_id).all()]
    if Product.query.filter(Product.category_id.in_([category_id] + descendant_ids)).first():
        return error("Category contains product listings and cannot be deleted", 409)
    db.session.delete(category)
    db.session.commit()
    return jsonify({"message": "Category deleted"})
