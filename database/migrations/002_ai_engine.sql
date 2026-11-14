USE smart_rental_sharing;

-- Apply once after 001_phase2_backend.sql to an existing Phase 1 database.
ALTER TABLE bookings ADD COLUMN suspicion_reason VARCHAR(500) NULL AFTER is_suspicious;

CREATE TABLE category_pricing (
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

CREATE TABLE search_history (
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

CREATE TABLE platform_policies (
  policy_key VARCHAR(80) NOT NULL,
  policy_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (policy_key)
) ENGINE=InnoDB;

INSERT INTO category_pricing (category_id, median_daily_price, median_retail_value, sample_count)
SELECT id,
  CASE name WHEN 'Laptops' THEN 900 WHEN 'Cameras' THEN 800 WHEN 'Audio Equipment' THEN 500
    WHEN 'Gaming Consoles' THEN 600 WHEN 'Projectors' THEN 700 WHEN 'Bicycles' THEN 300
    WHEN 'Cars' THEN 3000 WHEN 'Scooters & Motorbikes' THEN 900 WHEN 'Musical Instruments' THEN 450
    WHEN 'Books & Textbooks' THEN 100 WHEN 'Online Course Access' THEN 250 WHEN 'Tools & Lab Equipment' THEN 500
    WHEN 'Furniture' THEN 600 WHEN 'Kitchen Appliances' THEN 450 WHEN 'Cleaning Equipment' THEN 350
    WHEN 'Home Improvement Tools' THEN 400 WHEN 'Party Supplies' THEN 350 WHEN 'Audio & DJ Equipment' THEN 1200
    WHEN 'Lighting & Decorations' THEN 500 WHEN 'Event Tents & Seating' THEN 1000 WHEN 'Fitness Equipment' THEN 500
    WHEN 'Outdoor Sports Gear' THEN 350 WHEN 'Water Sports Gear' THEN 500 WHEN 'Team Sports Equipment' THEN 250
    WHEN 'Winter Sports Gear' THEN 700 END,
  CASE name WHEN 'Laptops' THEN 37800 WHEN 'Cameras' THEN 33600 WHEN 'Audio Equipment' THEN 21000
    WHEN 'Gaming Consoles' THEN 25200 WHEN 'Projectors' THEN 29400 WHEN 'Bicycles' THEN 12600
    WHEN 'Cars' THEN 126000 WHEN 'Scooters & Motorbikes' THEN 37800 WHEN 'Musical Instruments' THEN 18900
    WHEN 'Books & Textbooks' THEN 4200 WHEN 'Online Course Access' THEN 10500 WHEN 'Tools & Lab Equipment' THEN 21000
    WHEN 'Furniture' THEN 25200 WHEN 'Kitchen Appliances' THEN 18900 WHEN 'Cleaning Equipment' THEN 14700
    WHEN 'Home Improvement Tools' THEN 16800 WHEN 'Party Supplies' THEN 14700 WHEN 'Audio & DJ Equipment' THEN 50400
    WHEN 'Lighting & Decorations' THEN 21000 WHEN 'Event Tents & Seating' THEN 42000 WHEN 'Fitness Equipment' THEN 21000
    WHEN 'Outdoor Sports Gear' THEN 14700 WHEN 'Water Sports Gear' THEN 21000 WHEN 'Team Sports Equipment' THEN 10500
    WHEN 'Winter Sports Gear' THEN 29400 END,
  40
FROM categories
WHERE parent_category IS NOT NULL AND name IN (
  'Laptops','Cameras','Audio Equipment','Gaming Consoles','Projectors','Bicycles','Cars',
  'Scooters & Motorbikes','Musical Instruments','Books & Textbooks','Online Course Access',
  'Tools & Lab Equipment','Furniture','Kitchen Appliances','Cleaning Equipment',
  'Home Improvement Tools','Party Supplies','Audio & DJ Equipment','Lighting & Decorations',
  'Event Tents & Seating','Fitness Equipment','Outdoor Sports Gear','Water Sports Gear',
  'Team Sports Equipment','Winter Sports Gear');

INSERT INTO platform_policies (policy_key, policy_value) VALUES
  ('booking_workflow', 'Every booking request requires owner approval. Payment confirms an approved booking. The owner records item handover to start the rental; the renter or owner records return to finish it.'),
  ('cancellation', 'A renter may cancel a Pending or Approved booking before payment verification. A booking cannot be cancelled through the self-service flow after payment is verified.'),
  ('deposit_refund', 'Security deposits are held separately from rental charges. After the item is returned, the deposit is eligible for refund when the owner confirms its condition and no open complaint or damage claim applies. This platform simulation does not move real money.'),
  ('late_return', 'Late returns are recorded in rental history. The configured late fee is the product daily price multiplied by the configured LATE_PENALTY_MULTIPLIER for each late day.');
