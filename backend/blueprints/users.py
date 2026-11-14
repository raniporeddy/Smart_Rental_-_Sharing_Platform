from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Product, SavedProduct, User
from ..utils import current_user_id, error, product_json

bp = Blueprint("users", __name__, url_prefix="/api/users")


@bp.get("/<int:user_id>")
def public_profile(user_id):
    user = User.query.filter_by(id=user_id, is_active=True).first()
    if not user:
        return error("Profile not found", 404)
    return jsonify({"id": user.id, "full_name": user.full_name, "location": user.location,
                    "avatar_url": user.avatar_url, "created_at": user.created_at.isoformat()})


@bp.get("/me/saved-products")
@jwt_required()
def saved_products():
    user_id = current_user_id()
    rows = (db.session.query(Product).join(SavedProduct, SavedProduct.product_id == Product.id)
            .filter(SavedProduct.user_id == user_id, Product.is_removed.is_(False))
            .order_by(SavedProduct.created_at.desc()).all())
    return jsonify({"items": [product_json(product) for product in rows]})


@bp.post("/me/saved-products/<int:product_id>")
@jwt_required()
def save_product(product_id):
    product = Product.query.filter_by(id=product_id, is_approved=True, is_removed=False).first()
    if not product:
        return error("Product not found", 404)
    row = db.session.get(SavedProduct, (current_user_id(), product_id))
    if not row:
        db.session.add(SavedProduct(user_id=current_user_id(), product_id=product_id))
        db.session.commit()
    return jsonify({"saved": True, "product_id": product_id}), 201


@bp.delete("/me/saved-products/<int:product_id>")
@jwt_required()
def unsave_product(product_id):
    row = db.session.get(SavedProduct, (current_user_id(), product_id))
    if row:
        db.session.delete(row)
        db.session.commit()
    return jsonify({"saved": False, "product_id": product_id})
