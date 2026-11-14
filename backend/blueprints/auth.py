import secrets
import re
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from sqlalchemy import func

from ..extensions import db
from ..models import PasswordResetToken, User
from ..utils import check_password, error, hash_password, json_body, token_hash, user_json

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def valid_password(password):
    return isinstance(password, str) and 10 <= len(password) and len(password.encode("utf-8")) <= 72


@bp.post("/register")
def register():
    data = json_body()
    raw_name, raw_email = data.get("name", ""), data.get("email", "")
    name = raw_name.strip() if isinstance(raw_name, str) else ""
    email = raw_email.strip().lower() if isinstance(raw_email, str) else ""
    phone, password = data.get("phone"), data.get("password", "")
    if not isinstance(password, str):
        password = ""
    if (not name or len(name) > 120 or not EMAIL_PATTERN.fullmatch(email) or len(email) > 254
            or not valid_password(password)):
        return error("Name, valid email, and password of at least 10 characters are required", 400)
    if phone is not None and (not isinstance(phone, str) or len(phone) > 32):
        return error("phone must contain at most 32 characters", 400)
    if db.session.query(User.id).filter(func.lower(User.email) == email).first():
        return error("An account with this email already exists", 409)
    user = User(full_name=name, email=email, phone=phone, password_hash=hash_password(password))
    db.session.add(user)
    db.session.commit()
    return jsonify({"user": user_json(user)}), 201


@bp.post("/login")
def login():
    data = json_body()
    raw_email = data.get("email", "")
    email = raw_email.strip().lower() if isinstance(raw_email, str) else ""
    user = User.query.filter(func.lower(User.email) == email).first()
    if not user or not user.is_active or not check_password(data.get("password", ""), user.password_hash):
        return error("Invalid email or password", 401)
    access_token = create_access_token(identity=str(user.id), additional_claims={"role": user.role})
    return jsonify({"access_token": access_token, "token_type": "Bearer", "user": user_json(user)})


@bp.post("/forgot-password")
def forgot_password():
    data = json_body()
    raw_email = data.get("email", "")
    email = raw_email.strip().lower() if isinstance(raw_email, str) else ""
    user = User.query.filter(func.lower(User.email) == email).first()
    response = {"message": "If the account exists, a reset token has been generated"}
    if user and user.is_active:
        raw_token = secrets.token_urlsafe(32)
        reset = PasswordResetToken(user_id=user.id, token_hash=token_hash(raw_token),
                                  expires_at=datetime.utcnow() + timedelta(minutes=current_app.config["RESET_TOKEN_MINUTES"]))
        db.session.add(reset)
        db.session.commit()
        if current_app.config.get("RESET_TOKEN_DELIVERY", "simulation") == "simulation":
            response["reset_token"] = raw_token
    return jsonify(response), 200


@bp.post("/reset-password")
def reset_password():
    data = json_body()
    token, password = data.get("token", ""), data.get("password", "")
    if not isinstance(token, str):
        token = ""
    if not isinstance(password, str):
        password = ""
    if not token or not valid_password(password):
        return error("A reset token and password of at least 10 characters are required", 400)
    reset = PasswordResetToken.query.filter_by(token_hash=token_hash(token), used_at=None).first()
    now = datetime.utcnow()
    if not reset or reset.expires_at <= now:
        return error("Reset token is invalid or expired", 400)
    user = db.session.get(User, reset.user_id)
    if not user or not user.is_active:
        return error("Account is unavailable", 400)
    user.password_hash = hash_password(password)
    reset.used_at = now
    db.session.commit()
    return jsonify({"message": "Password updated"})


@bp.get("/profile")
@jwt_required()
def get_profile():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return error("Account unavailable", 404)
    return jsonify({"user": user_json(user)})


@bp.put("/profile")
@jwt_required()
def update_profile():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return error("Account unavailable", 404)
    data = json_body()
    if "full_name" in data:
        name = data["full_name"].strip() if isinstance(data["full_name"], str) else ""
        if not name or len(name) > 120:
            return error("Full name must contain 1 to 120 characters", 400)
        user.full_name = name
    if "phone" in data:
        user.phone = data["phone"]
    if "location" in data:
        user.location = data["location"]
    if "avatar_url" in data:
        user.avatar_url = data["avatar_url"]
    db.session.commit()
    return jsonify({"user": user_json(user)})
