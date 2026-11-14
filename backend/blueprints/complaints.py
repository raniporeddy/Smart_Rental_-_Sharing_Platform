from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Booking, Complaint
from ..utils import current_user_id, error, json_body

bp = Blueprint("complaints", __name__, url_prefix="/api/complaints")


@bp.post("")
@jwt_required()
def create_complaint():
    data = json_body()
    try:
        booking_id = int(data.get("booking_id"))
    except (ValueError, TypeError):
        return error("booking_id is required", 400)
    booking = db.session.get(Booking, booking_id)
    if not booking or current_user_id() not in (booking.renter_id, booking.owner_id):
        return error("Complaint must relate to a booking you participated in", 403)
    subject = data.get("subject", "").strip() if isinstance(data.get("subject"), str) else ""
    description = data.get("description", "").strip() if isinstance(data.get("description"), str) else ""
    if not subject or not description:
        return error("subject and description are required", 400)
    complaint = Complaint(complainant_id=current_user_id(), booking_id=booking.id,
                          subject=subject, description=description)
    db.session.add(complaint)
    db.session.commit()
    return jsonify({"id": complaint.id, "status": complaint.status}), 201
