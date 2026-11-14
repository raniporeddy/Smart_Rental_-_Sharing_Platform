from datetime import datetime

from .extensions import db


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.BigInteger, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(254), nullable=False, unique=True)
    phone = db.Column(db.String(32))
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum("user", "admin"), nullable=False, default="user")
    location = db.Column(db.String(180))
    avatar_url = db.Column(db.String(2048))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class Category(db.Model):
    __tablename__ = "categories"
    id = db.Column(db.BigInteger, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    parent_category = db.Column(db.BigInteger, db.ForeignKey("categories.id", ondelete="CASCADE"))
    icon_name = db.Column(db.String(80))


class CategoryPricing(db.Model):
    __tablename__ = "category_pricing"
    category_id = db.Column(db.BigInteger, db.ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)
    median_daily_price = db.Column(db.Numeric(12, 2), nullable=False)
    median_retail_value = db.Column(db.Numeric(12, 2), nullable=False)
    sample_count = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class Product(db.Model):
    __tablename__ = "products"
    id = db.Column(db.BigInteger, primary_key=True)
    owner_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id = db.Column(db.BigInteger, db.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text, nullable=False)
    price_per_day = db.Column(db.Numeric(12, 2), nullable=False)
    security_deposit = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    location = db.Column(db.String(180), nullable=False)
    condition_status = db.Column(db.Enum("New", "Like New", "Good", "Fair"), nullable=False)
    available_from = db.Column(db.Date)
    available_to = db.Column(db.Date)
    is_available = db.Column(db.Boolean, nullable=False, default=True)
    is_flagged_fraud = db.Column(db.Boolean, nullable=False, default=False)
    fraud_reason = db.Column(db.String(500))
    is_approved = db.Column(db.Boolean, nullable=False, default=False)
    is_removed = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    images = db.relationship("ProductImage", cascade="all, delete-orphan", lazy="selectin")


class ProductImage(db.Model):
    __tablename__ = "product_images"
    id = db.Column(db.BigInteger, primary_key=True)
    product_id = db.Column(db.BigInteger, db.ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    image_url = db.Column(db.String(2048), nullable=False)
    is_primary = db.Column(db.Boolean, nullable=False, default=False)


class SavedProduct(db.Model):
    __tablename__ = "saved_products"
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    product_id = db.Column(db.BigInteger, db.ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class Booking(db.Model):
    __tablename__ = "bookings"
    id = db.Column(db.BigInteger, primary_key=True)
    product_id = db.Column(db.BigInteger, db.ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    renter_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    owner_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    return_date = db.Column(db.Date, nullable=False)
    actual_return_date = db.Column(db.Date)
    total_days = db.Column(db.Integer, nullable=False)
    rental_amount = db.Column(db.Numeric(12, 2), nullable=False)
    deposit_amount = db.Column(db.Numeric(12, 2), nullable=False)
    total_payable = db.Column(db.Numeric(12, 2), nullable=False)
    status = db.Column(db.Enum("Pending", "Approved", "Rejected", "Confirmed", "Active", "Returned", "Completed", "Cancelled"), nullable=False, default="Pending")
    is_suspicious = db.Column(db.Boolean, nullable=False, default=False)
    suspicion_reason = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    product = db.relationship("Product", lazy="joined")


class Payment(db.Model):
    __tablename__ = "payments"
    id = db.Column(db.BigInteger, primary_key=True)
    booking_id = db.Column(db.BigInteger, db.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    transaction_id = db.Column(db.String(120), unique=True)
    confirmation_token = db.Column(db.String(64), unique=True)
    payment_method = db.Column(db.Enum("UPI", "Card", "NetBanking"), nullable=False)
    rental_paid = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    deposit_paid = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    total_paid = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    payment_status = db.Column(db.Enum("Pending", "Verified", "Failed", "Refunded"), nullable=False, default="Pending")
    paid_at = db.Column(db.DateTime)


class Review(db.Model):
    __tablename__ = "reviews"
    id = db.Column(db.BigInteger, primary_key=True)
    booking_id = db.Column(db.BigInteger, db.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    product_id = db.Column(db.BigInteger, db.ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    reviewer_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(180), nullable=False)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(50), nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class SearchHistory(db.Model):
    __tablename__ = "search_history"
    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    query_text = db.Column(db.String(500), nullable=False)
    category_id = db.Column(db.BigInteger, db.ForeignKey("categories.id", ondelete="CASCADE"))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class PlatformPolicy(db.Model):
    __tablename__ = "platform_policies"
    policy_key = db.Column(db.String(80), primary_key=True)
    policy_value = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class Complaint(db.Model):
    __tablename__ = "complaints"
    id = db.Column(db.BigInteger, primary_key=True)
    complainant_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    booking_id = db.Column(db.BigInteger, db.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    subject = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.Enum("Open", "Investigating", "Resolved"), nullable=False, default="Open")
    admin_notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class RentalHistory(db.Model):
    __tablename__ = "rental_history"
    id = db.Column(db.BigInteger, primary_key=True)
    booking_id = db.Column(db.BigInteger, db.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, unique=True)
    product_id = db.Column(db.BigInteger, db.ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    renter_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    owner_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    completed_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    late_days = db.Column(db.Integer, nullable=False, default=0)
    penalty_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"
    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = db.Column(db.String(64), nullable=False, unique=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
