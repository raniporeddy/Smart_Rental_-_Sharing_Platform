from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt


def admin_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if get_jwt().get("role") != "admin":
            return jsonify({"error": "Administrator access required"}), 403
        return fn(*args, **kwargs)
    return wrapped
