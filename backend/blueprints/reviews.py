from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Booking, Product, Review
from ..utils import current_user_id, error, json_body

bp = Blueprint("reviews", __name__, url_prefix="/api/reviews")


@bp.post("")
@jwt_required()
def create_review():
    data = json_body()
    try:
        booking_id = int(data.get("booking_id"))
        rating = int(data.get("rating"))
    except (ValueError, TypeError):
        return error("booking_id and rating are required", 400)
    if rating < 1 or rating > 5:
        return error("rating must be between 1 and 5", 400)
    booking = Booking.query.filter_by(id=booking_id, renter_id=current_user_id()).first()
    if not booking or booking.status not in {"Returned", "Completed"}:
        return error("A review requires a returned or completed booking you rented", 403)
    if Review.query.filter_by(booking_id=booking.id, reviewer_id=current_user_id()).first():
        return error("This booking already has a review", 409)
    product = db.session.get(Product, booking.product_id)
    if not product:
        return error("Product not found", 404)
    review = Review(booking_id=booking.id, product_id=product.id, reviewer_id=current_user_id(),
                    rating=rating, comment=(data.get("comment") or "").strip() or None
                    if isinstance(data.get("comment", ""), str) else None)
    db.session.add(review)
    db.session.commit()
    return jsonify({"review": {"id": review.id, "booking_id": review.booking_id,
                               "product_id": review.product_id, "reviewer_id": review.reviewer_id,
                               "rating": review.rating, "comment": review.comment,
                               "created_at": review.created_at.isoformat()}}), 201


@bp.get("/product/<int:product_id>")
def product_reviews(product_id):
    if not db.session.get(Product, product_id):
        return error("Product not found", 404)
    rows = Review.query.filter_by(product_id=product_id).order_by(Review.created_at.desc()).all()
    return jsonify({"items": [{"id": r.id, "booking_id": r.booking_id, "reviewer_id": r.reviewer_id,
                               "rating": r.rating, "comment": r.comment,
                               "created_at": r.created_at.isoformat()} for r in rows]})
