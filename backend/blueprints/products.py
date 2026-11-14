import os
import uuid

from flask import Blueprint, current_app, jsonify, request, url_for
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func, or_
from werkzeug.utils import secure_filename

from ..ai_engine import AI_ENGINE
from ..extensions import db
from ..models import Booking, Category, Notification, Product, ProductImage, SearchHistory, User
from ..utils import error, json_body, parse_date, parse_money, product_json

bp = Blueprint("products", __name__, url_prefix="/api/products")
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}


def product_query():
    return Product.query.filter_by(is_available=True, is_approved=True, is_removed=False, is_flagged_fraud=False)


@bp.get("")
@jwt_required(optional=True)
def search_products():
    query = product_query()
    q = request.args.get("q", "").strip()
    if q:
        query = query.filter(or_(Product.title.ilike(f"%{q}%"), Product.description.ilike(f"%{q}%")))
    category, subcategory = request.args.get("category"), request.args.get("subcategory")
    selected_category_id = None
    if bool(request.args.get("start_date")) != bool(request.args.get("end_date")):
        return error("start_date and end_date must be provided together", 400)
    if subcategory:
        cat = Category.query.filter(or_(Category.id == int(subcategory) if subcategory.isdigit() else False,
                                        func.lower(Category.name) == subcategory.lower())).first()
        if not cat:
            return jsonify({"items": [], "total": 0})
        selected_category_id = cat.id
        query = query.filter(Product.category_id == cat.id)
    elif category:
        cat = Category.query.filter(or_(Category.id == int(category) if category.isdigit() else False,
                                        func.lower(Category.name) == category.lower())).first()
        if not cat:
            return jsonify({"items": [], "total": 0})
        selected_category_id = cat.id
        ids = [cat.id] + [row.id for row in Category.query.filter_by(parent_category=cat.id).all()]
        query = query.filter(Product.category_id.in_(ids))
    if request.args.get("location"):
        query = query.filter(Product.location.ilike(f"%{request.args['location'].strip()}%"))
    try:
        if request.args.get("min_price") is not None:
            query = query.filter(Product.price_per_day >= parse_money(request.args["min_price"], "min_price"))
        if request.args.get("max_price") is not None:
            query = query.filter(Product.price_per_day <= parse_money(request.args["max_price"], "max_price"))
        start = parse_date(request.args["start_date"], "start_date") if request.args.get("start_date") else None
        end = parse_date(request.args["end_date"], "end_date") if request.args.get("end_date") else None
    except ValueError as exc:
        return error(str(exc), 400)
    if start and end and end < start:
        return error("end_date must be on or after start_date", 400)
    if start:
        query = query.filter(or_(Product.available_from.is_(None), Product.available_from <= start))
    if end:
        query = query.filter(or_(Product.available_to.is_(None), Product.available_to >= end))
    if start and end:
        conflict = db.session.query(Booking.id).filter(
            Booking.product_id == Product.id, Booking.status.in_(["Confirmed", "Active"]),
            Booking.start_date <= end, Booking.return_date >= start).exists()
        query = query.filter(~conflict)
    sort = request.args.get("sort", "newest")
    if sort == "price_asc":
        query = query.order_by(Product.price_per_day.asc(), Product.id.desc())
    elif sort == "price_desc":
        query = query.order_by(Product.price_per_day.desc(), Product.id.desc())
    elif sort == "newest":
        query = query.order_by(Product.created_at.desc(), Product.id.desc())
    else:
        return error("sort must be price_asc, price_desc, or newest", 400)
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, max(1, request.args.get("per_page", 24, type=int)))
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    user_id = get_jwt_identity()
    tracked_filters = {key: value for key, value in request.args.items()
                       if key not in {"page", "per_page", "sort"} and value.strip()}
    if user_id and tracked_filters:
        db.session.add(SearchHistory(user_id=int(user_id), category_id=selected_category_id,
                                     query_text=" ".join(f"{key}:{value}" for key, value in tracked_filters.items())[:500]))
        db.session.commit()
    return jsonify({"items": [product_json(p) for p in pagination.items], "total": pagination.total,
                    "page": page, "per_page": per_page, "pages": pagination.pages})


@bp.get("/<int:product_id>")
def get_product(product_id):
    product = product_query().filter_by(id=product_id).first()
    if not product:
        return error("Product not found", 404)
    return jsonify({"product": product_json(product)})


@bp.get("/<int:product_id>/availability")
def product_availability(product_id):
    product = Product.query.filter_by(id=product_id, is_removed=False).first()
    if not product:
        return error("Product not found", 404)
    rows = Booking.query.filter(Booking.product_id == product_id,
                                Booking.status.in_(["Confirmed", "Active"]))\
        .order_by(Booking.start_date.asc()).all()
    return jsonify({"product_id": product_id,
                    "available_from": product.available_from.isoformat() if product.available_from else None,
                    "available_to": product.available_to.isoformat() if product.available_to else None,
                    "booked_dates": [{"start_date": row.start_date.isoformat(),
                                      "end_date": row.return_date.isoformat()} for row in rows]})


@bp.get("/mine")
@jwt_required()
def my_products():
    owner_id = int(get_jwt_identity())
    rows = Product.query.filter_by(owner_id=owner_id, is_removed=False).order_by(Product.created_at.desc()).all()
    return jsonify({"items": [product_json(p) for p in rows]})


@bp.post("")
@jwt_required()
def create_product():
    data = request.form.to_dict() if request.form else json_body()
    uploaded_images = request.files.getlist("images")
    image_classification = None
    try:
        title = data.get("title", "").strip() if isinstance(data.get("title"), str) else ""
        description = data.get("description", "").strip() if isinstance(data.get("description"), str) else ""
        location = data.get("location", "").strip() if isinstance(data.get("location"), str) else ""
        category_id = int(data["category_id"]) if data.get("category_id") else None
        price = parse_money(data.get("price_per_day"), "price_per_day")
        deposit = parse_money(data.get("security_deposit", 0), "security_deposit")
        condition = data.get("condition_status")
        available_from = parse_date(data["available_from"], "available_from") if data.get("available_from") else None
        available_to = parse_date(data["available_to"], "available_to") if data.get("available_to") else None
    except (ValueError, TypeError) as exc:
        return error(str(exc) or "Invalid product data", 400)
    if uploaded_images:
        try:
            image_classification = AI_ENGINE.classify_image(uploaded_images[0])
            uploaded_images[0].stream.seek(0)
        except (ValueError, OSError) as exc:
            return error(str(exc), 400)
    confident_image_match = bool(image_classification and (
        image_classification.get("method") == "MobileNetV2" and image_classification.get("confidence", 0) >= 0.30
        or image_classification.get("method") == "Pillow visual matching" and image_classification.get("confidence", 0) >= 0.985))
    if category_id is None and confident_image_match:
        category_id = image_classification.get("category_id")
    if category_id is None:
        return error("category_id is required unless the image classifier returns a confident match", 400)
    if not title or not description or not location or condition not in {"New", "Like New", "Good", "Fair"}:
        return error("Title, description, location, and a valid condition are required", 400)
    if available_from and available_to and available_to < available_from:
        return error("available_to must not precede available_from", 400)
    if not db.session.get(Category, category_id):
        return error("Category not found", 400)
    fraud_reason = AI_ENGINE.assess_listing(category_id, float(price), condition, float(deposit))
    product = Product(owner_id=int(get_jwt_identity()), category_id=category_id, title=title,
                      description=description, price_per_day=price, security_deposit=deposit,
                      location=location, condition_status=condition, available_from=available_from,
                      available_to=available_to, is_approved=False,
                      is_flagged_fraud=bool(fraud_reason), fraud_reason=fraud_reason)
    db.session.add(product)
    db.session.flush()
    saved_paths = []
    try:
        for index, uploaded in enumerate(uploaded_images):
            safe_name = secure_filename(uploaded.filename or "")
            extension = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
            if not safe_name or extension not in ALLOWED_IMAGE_EXTENSIONS:
                raise ValueError("Images must be JPG, PNG, WEBP, or GIF files")
            file_name = f"{uuid.uuid4().hex}_{safe_name}"
            os.makedirs(current_app.config["UPLOAD_FOLDER"], exist_ok=True)
            path = os.path.join(current_app.config["UPLOAD_FOLDER"], file_name)
            uploaded.save(path)
            saved_paths.append(path)
            db.session.add(ProductImage(product_id=product.id,
                                        image_url=url_for("static", filename=f"uploads/{file_name}", _external=True),
                                        is_primary=index == 0))
        if fraud_reason:
            for admin in User.query.filter_by(role="admin", is_active=True).all():
                db.session.add(Notification(
                    user_id=admin.id, title="Listing flagged for review",
                    message=f"Product {product.id} was automatically flagged: {fraud_reason}",
                    type="fraud_review"))
        db.session.commit()
    except ValueError as exc:
        db.session.rollback()
        for path in saved_paths:
            if os.path.exists(path):
                os.remove(path)
        return error(str(exc), 400)
    except Exception:
        db.session.rollback()
        for path in saved_paths:
            if os.path.exists(path):
                os.remove(path)
        raise
    return jsonify({"product": product_json(product), "image_classification": image_classification,
                    "message": "Product submitted for admin approval"}), 201


@bp.put("/<int:product_id>")
@jwt_required()
def update_product(product_id):
    product = db.session.get(Product, product_id)
    if not product or product.is_removed:
        return error("Product not found", 404)
    if product.owner_id != int(get_jwt_identity()):
        return error("Only the owner can update this product", 403)
    data = json_body()
    fields = {"title": (180, True), "description": (None, True), "location": (180, True)}
    for field, (maximum, required) in fields.items():
        if field in data:
            value = data[field].strip() if isinstance(data[field], str) else ""
            if required and not value or maximum and len(value) > maximum:
                return error(f"{field} is invalid", 400)
            setattr(product, field, value)
    try:
        if "price_per_day" in data:
            product.price_per_day = parse_money(data["price_per_day"], "price_per_day")
        if "security_deposit" in data:
            product.security_deposit = parse_money(data["security_deposit"], "security_deposit")
        if "category_id" in data:
            category_id = int(data["category_id"])
            if not db.session.get(Category, category_id):
                return error("Category not found", 404)
            product.category_id = category_id
        if "available_from" in data:
            product.available_from = parse_date(data["available_from"], "available_from") if data["available_from"] else None
        if "available_to" in data:
            product.available_to = parse_date(data["available_to"], "available_to") if data["available_to"] else None
    except (ValueError, TypeError) as exc:
        return error(str(exc), 400)
    if "condition_status" in data:
        if data["condition_status"] not in {"New", "Like New", "Good", "Fair"}:
            return error("condition_status is invalid", 400)
        product.condition_status = data["condition_status"]
    if "is_available" in data:
        if not isinstance(data["is_available"], bool):
            return error("is_available must be a boolean", 400)
        product.is_available = data["is_available"]
    if product.available_from and product.available_to and product.available_to < product.available_from:
        return error("available_to must not precede available_from", 400)
    listing_changed = bool({"title", "description", "location", "price_per_day", "security_deposit",
                            "category_id", "condition_status", "available_from", "available_to"} & data.keys())
    if listing_changed:
        product.is_approved = False
    fraud_reason = AI_ENGINE.assess_listing(product.category_id, float(product.price_per_day),
                                            product.condition_status, float(product.security_deposit))
    if fraud_reason:
        product.is_flagged_fraud = True
        product.fraud_reason = fraud_reason
        for admin in User.query.filter_by(role="admin", is_active=True).all():
            db.session.add(Notification(user_id=admin.id, title="Updated listing flagged for review",
                                        message=f"Product {product.id} was automatically flagged: {fraud_reason}",
                                        type="fraud_review"))
    db.session.commit()
    return jsonify({"product": product_json(product), "message": "Product updated and sent for approval"})


@bp.delete("/<int:product_id>")
@jwt_required()
def remove_my_product(product_id):
    product = db.session.get(Product, product_id)
    if not product or product.is_removed:
        return error("Product not found", 404)
    if product.owner_id != int(get_jwt_identity()):
        return error("Only the owner can remove this product", 403)
    product.is_removed = True
    product.is_available = False
    db.session.commit()
    return jsonify({"message": "Product removed"})
