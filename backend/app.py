import os
import re
from decimal import Decimal, InvalidOperation

from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from sqlalchemy.exc import IntegrityError

from .config import Config
from .ai_engine import AI_ENGINE
from .extensions import db, jwt
from .models import User


def create_app(config_overrides=None):
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)
    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        raise RuntimeError("Set DATABASE_URL before starting the API")
    if not app.config.get("JWT_SECRET_KEY"):
        raise RuntimeError("Set JWT_SECRET_KEY before starting the API")
    try:
        penalty_multiplier = Decimal(str(app.config["LATE_PENALTY_MULTIPLIER"]))
        if not penalty_multiplier.is_finite() or penalty_multiplier < 0:
            raise InvalidOperation
    except (InvalidOperation, TypeError):
        raise RuntimeError("LATE_PENALTY_MULTIPLIER must be a finite non-negative number")
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    jwt.init_app(app)
    AI_ENGINE.initialize(app)
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        re.compile(r"^https://[a-zA-Z0-9_\-.]*\.vercel\.app$"),
    ]
    configured_origins = app.config.get("CORS_ORIGINS", "")
    if isinstance(configured_origins, str):
        extra_origins = [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
    elif isinstance(configured_origins, (list, tuple, set)):
        extra_origins = list(configured_origins)
    else:
        extra_origins = []
    for origin in extra_origins:
        if origin not in origins:
            origins.append(origin)
    CORS(app, resources={r"/api/*": {"origins": origins}}, supports_credentials=False)

    from .blueprints import admin, ai, auth, bookings, complaints, notifications, payments, products, reviews, users
    for blueprint in (auth.bp, products.bp, bookings.bp, payments.bp, notifications.bp,
                      reviews.bp, complaints.bp, admin.bp, ai.bp, users.bp):
        app.register_blueprint(blueprint)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "smart-rental-sharing-api"})

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(exc):
        db.session.rollback()
        app.logger.info("Rejected conflicting database write: %s", exc.orig)
        return jsonify({"error": "The request conflicts with existing data"}), 409

    @app.errorhandler(413)
    def file_too_large(_exc):
        return jsonify({"error": "Upload exceeds the configured size limit"}), 413

    @app.errorhandler(404)
    def not_found(_exc):
        return jsonify({"error": "Route or resource not found"}), 404

    @app.errorhandler(HTTPException)
    def handle_http_error(exc):
        return jsonify({"error": exc.description}), exc.code

    @app.errorhandler(Exception)
    def handle_unexpected_error(exc):
        app.logger.exception("Unhandled API error", exc_info=exc)
        return jsonify({"error": "An unexpected server error occurred"}), 500

    @jwt.unauthorized_loader
    def missing_token(reason):
        return jsonify({"error": "Authentication required", "detail": reason}), 401

    @jwt.invalid_token_loader
    def invalid_token(reason):
        return jsonify({"error": "Invalid authentication token", "detail": reason}), 401

    @jwt.expired_token_loader
    def expired_token(_header, _payload):
        return jsonify({"error": "Authentication token expired"}), 401

    @jwt.token_verification_loader
    def verify_active_user(header, payload):
        try:
            user = db.session.get(User, int(payload.get("sub")))
            return bool(user and user.is_active and user.role == payload.get("role"))
        except (TypeError, ValueError):
            return False

    @jwt.token_verification_failed_loader
    def failed_user_verification(_header, _payload):
        return jsonify({"error": "Account is inactive or authorization has changed"}), 401

    return app
