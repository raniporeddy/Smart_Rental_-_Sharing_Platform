USE smart_rental_sharing;

-- Apply once to a database initialized with the original Phase 1 schema.
ALTER TABLE products
  ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT TRUE AFTER fraud_reason,
  ADD COLUMN is_removed BOOLEAN NOT NULL DEFAULT FALSE AFTER is_approved,
  ADD KEY idx_products_moderation (is_approved, is_removed);
ALTER TABLE products MODIFY COLUMN is_approved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE payments
  ADD COLUMN confirmation_token CHAR(64) NULL AFTER transaction_id,
  ADD UNIQUE KEY uq_payments_confirmation_token (confirmation_token);

CREATE TABLE password_reset_tokens (
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
