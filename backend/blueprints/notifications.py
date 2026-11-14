from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Notification
from ..utils import current_user_id, error

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@bp.get("")
@jwt_required()
def list_notifications():
    user_id = current_user_id()
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, max(1, request.args.get("per_page", 30, type=int)))
    pagination = Notification.query.filter_by(user_id=user_id).order_by(Notification.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False)
    unread = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    return jsonify({"items": [{"id": n.id, "title": n.title, "message": n.message, "type": n.type,
                               "is_read": n.is_read, "created_at": n.created_at.isoformat()} for n in pagination.items],
                    "total": pagination.total, "unread_count": unread, "page": page, "pages": pagination.pages})


@bp.put("/<int:notification_id>/read")
@jwt_required()
def mark_read(notification_id):
    notification = Notification.query.filter_by(id=notification_id, user_id=current_user_id()).first()
    if not notification:
        return error("Notification not found", 404)
    notification.is_read = True
    db.session.commit()
    return jsonify({"id": notification.id, "is_read": True})


@bp.post("/read-all")
@jwt_required()
def mark_all_read():
    Notification.query.filter_by(user_id=current_user_id(), is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "Notifications marked as read"})
