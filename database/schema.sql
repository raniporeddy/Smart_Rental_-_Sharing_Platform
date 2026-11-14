CREATE DATABASE IF NOT EXISTS smart_rental_sharing
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE smart_rental_sharing;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(32) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  location VARCHAR(180) NULL,
  avatar_url VARCHAR(2048) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_active (role, is_active),
  KEY idx_users_location (location)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  parent_category BIGINT UNSIGNED NULL,
  icon_name VARCHAR(80) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_parent_name (parent_category, name),
  KEY idx_categories_parent (parent_category),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_category)
    REFERENCES categories(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS category_pricing (
  category_id BIGINT UNSIGNED NOT NULL,
  median_daily_price DECIMAL(12,2) NOT NULL,
  median_retail_value DECIMAL(12,2) NOT NULL,
  sample_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (category_id),
  CONSTRAINT chk_category_pricing_amounts CHECK (median_daily_price > 0 AND median_retail_value > 0),
  CONSTRAINT fk_category_pricing_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  price_per_day DECIMAL(12,2) NOT NULL,
  security_deposit DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  location VARCHAR(180) NOT NULL,
  condition_status ENUM('New', 'Like New', 'Good', 'Fair') NOT NULL,
  available_from DATE NULL,
  available_to DATE NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_flagged_fraud BOOLEAN NOT NULL DEFAULT FALSE,
  fraud_reason VARCHAR(500) NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  is_removed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_products_owner_created (owner_id, created_at),
  KEY idx_products_category_available (category_id, is_available),
  KEY idx_products_location (location),
  KEY idx_products_price (price_per_day),
  KEY idx_products_fraud (is_flagged_fraud),
  KEY idx_products_moderation (is_approved, is_removed),
  CONSTRAINT chk_products_price CHECK (price_per_day >= 0),
  CONSTRAINT chk_products_deposit CHECK (security_deposit >= 0),
  CONSTRAINT chk_products_dates CHECK (available_to IS NULL OR available_from IS NULL OR available_to >= available_from),
  CONSTRAINT fk_products_owner FOREIGN KEY (owner_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  image_url VARCHAR(2048) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  KEY idx_product_images_product_primary (product_id, is_primary),
  CONSTRAINT fk_product_images_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saved_products (
  user_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id),
  KEY idx_saved_products_product (product_id),
  CONSTRAINT fk_saved_products_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_saved_products_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  renter_id BIGINT UNSIGNED NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  return_date DATE NOT NULL,
  actual_return_date DATE NULL,
  total_days INT UNSIGNED NOT NULL,
  rental_amount DECIMAL(12,2) NOT NULL,
  deposit_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_payable DECIMAL(12,2) NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected', 'Confirmed', 'Active', 'Returned', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  is_suspicious BOOLEAN NOT NULL DEFAULT FALSE,
  suspicion_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bookings_product_dates_status (product_id, start_date, return_date, status),
  KEY idx_bookings_renter_status_created (renter_id, status, created_at),
  KEY idx_bookings_owner_status_created (owner_id, status, created_at),
  KEY idx_bookings_suspicious (is_suspicious),
  CONSTRAINT chk_bookings_dates CHECK (return_date >= start_date),
  CONSTRAINT chk_bookings_total_days CHECK (total_days > 0),
  CONSTRAINT chk_bookings_amounts CHECK (rental_amount >= 0 AND deposit_amount >= 0 AND total_payable >= 0),
  CONSTRAINT fk_bookings_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_bookings_renter FOREIGN KEY (renter_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_bookings_owner FOREIGN KEY (owner_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  transaction_id VARCHAR(120) NULL,
  confirmation_token CHAR(64) NULL,
  payment_method ENUM('UPI', 'Card', 'NetBanking') NOT NULL,
  rental_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  deposit_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payment_status ENUM('Pending', 'Verified', 'Failed', 'Refunded') NOT NULL DEFAULT 'Pending',
  paid_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_transaction (transaction_id),
  UNIQUE KEY uq_payments_confirmation_token (confirmation_token),
  KEY idx_payments_booking_status (booking_id, payment_status),
  KEY idx_payments_paid_at (paid_at),
  CONSTRAINT chk_payments_amounts CHECK (rental_paid >= 0 AND deposit_paid >= 0 AND total_paid >= 0),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id)
    REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_token_hash (token_hash),
  KEY idx_password_reset_user_expiry (user_id, expires_at, used_at),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  reviewer_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reviews_booking_reviewer (booking_id, reviewer_id),
  KEY idx_reviews_product_created (product_id, created_at),
  KEY idx_reviews_reviewer (reviewer_id),
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id)
    REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reviews_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reviews_reviewer FOREIGN KEY (reviewer_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_read_created (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS search_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  query_text VARCHAR(500) NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_search_history_user_created (user_id, created_at),
  KEY idx_search_history_category (category_id),
  CONSTRAINT fk_search_history_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_search_history_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS platform_policies (
  policy_key VARCHAR(80) NOT NULL,
  policy_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (policy_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS complaints (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  complainant_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('Open', 'Investigating', 'Resolved') NOT NULL DEFAULT 'Open',
  admin_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_complaints_status_created (status, created_at),
  KEY idx_complaints_complainant (complainant_id),
  KEY idx_complaints_booking (booking_id),
  CONSTRAINT fk_complaints_complainant FOREIGN KEY (complainant_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_complaints_booking FOREIGN KEY (booking_id)
    REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rental_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  renter_id BIGINT UNSIGNED NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  late_days INT UNSIGNED NOT NULL DEFAULT 0,
  penalty_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rental_history_booking (booking_id),
  KEY idx_rental_history_renter_completed (renter_id, completed_at),
  KEY idx_rental_history_owner_completed (owner_id, completed_at),
  KEY idx_rental_history_product (product_id),
  CONSTRAINT chk_rental_history_penalty CHECK (penalty_amount >= 0),
  CONSTRAINT fk_rental_history_booking FOREIGN KEY (booking_id)
    REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rental_history_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rental_history_renter FOREIGN KEY (renter_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rental_history_owner FOREIGN KEY (owner_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
