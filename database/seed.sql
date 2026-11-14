USE smart_rental_sharing;

INSERT INTO categories (id, name, parent_category, icon_name) VALUES
  (1, 'Electronics', NULL, 'Laptop'),
  (2, 'Vehicles', NULL, 'Car'),
  (3, 'Education', NULL, 'BookOpen'),
  (4, 'Home & Furniture', NULL, 'Sofa'),
  (5, 'Events', NULL, 'PartyPopper'),
  (6, 'Sports', NULL, 'Dumbbell')
ON DUPLICATE KEY UPDATE name = VALUES(name), icon_name = VALUES(icon_name);

INSERT INTO categories (name, parent_category, icon_name) VALUES
  ('Laptops', 1, 'Laptop'),
  ('Cameras', 1, 'Camera'),
  ('Audio Equipment', 1, 'Headphones'),
  ('Gaming Consoles', 1, 'Gamepad2'),
  ('Projectors', 1, 'Projector'),
  ('Bicycles', 2, 'Bike'),
  ('Cars', 2, 'Car'),
  ('Scooters & Motorbikes', 2, 'Bike'),
  ('Musical Instruments', 3, 'Music'),
  ('Books & Textbooks', 3, 'BookOpen'),
  ('Online Course Access', 3, 'GraduationCap'),
  ('Tools & Lab Equipment', 3, 'Wrench'),
  ('Furniture', 4, 'Sofa'),
  ('Kitchen Appliances', 4, 'CookingPot'),
  ('Cleaning Equipment', 4, 'SprayCan'),
  ('Home Improvement Tools', 4, 'Hammer'),
  ('Party Supplies', 5, 'PartyPopper'),
  ('Audio & DJ Equipment', 5, 'Disc3'),
  ('Lighting & Decorations', 5, 'Lightbulb'),
  ('Event Tents & Seating', 5, 'TentTree'),
  ('Fitness Equipment', 6, 'Dumbbell'),
  ('Outdoor Sports Gear', 6, 'Mountain'),
  ('Water Sports Gear', 6, 'Waves'),
  ('Team Sports Equipment', 6, 'Volleyball'),
  ('Winter Sports Gear', 6, 'Snowflake')
ON DUPLICATE KEY UPDATE icon_name = VALUES(icon_name);

INSERT INTO category_pricing (category_id, median_daily_price, median_retail_value, sample_count) VALUES
  ((SELECT id FROM categories WHERE name='Laptops' AND parent_category=1), 900, 37800, 40),
  ((SELECT id FROM categories WHERE name='Cameras' AND parent_category=1), 800, 33600, 40),
  ((SELECT id FROM categories WHERE name='Audio Equipment' AND parent_category=1), 500, 21000, 40),
  ((SELECT id FROM categories WHERE name='Gaming Consoles' AND parent_category=1), 600, 25200, 40),
  ((SELECT id FROM categories WHERE name='Projectors' AND parent_category=1), 700, 29400, 40),
  ((SELECT id FROM categories WHERE name='Bicycles' AND parent_category=2), 300, 12600, 40),
  ((SELECT id FROM categories WHERE name='Cars' AND parent_category=2), 3000, 126000, 40),
  ((SELECT id FROM categories WHERE name='Scooters & Motorbikes' AND parent_category=2), 900, 37800, 40),
  ((SELECT id FROM categories WHERE name='Musical Instruments' AND parent_category=3), 450, 18900, 40),
  ((SELECT id FROM categories WHERE name='Books & Textbooks' AND parent_category=3), 100, 4200, 40),
  ((SELECT id FROM categories WHERE name='Online Course Access' AND parent_category=3), 250, 10500, 40),
  ((SELECT id FROM categories WHERE name='Tools & Lab Equipment' AND parent_category=3), 500, 21000, 40),
  ((SELECT id FROM categories WHERE name='Furniture' AND parent_category=4), 600, 25200, 40),
  ((SELECT id FROM categories WHERE name='Kitchen Appliances' AND parent_category=4), 450, 18900, 40),
  ((SELECT id FROM categories WHERE name='Cleaning Equipment' AND parent_category=4), 350, 14700, 40),
  ((SELECT id FROM categories WHERE name='Home Improvement Tools' AND parent_category=4), 400, 16800, 40),
  ((SELECT id FROM categories WHERE name='Party Supplies' AND parent_category=5), 350, 14700, 40),
  ((SELECT id FROM categories WHERE name='Audio & DJ Equipment' AND parent_category=5), 1200, 50400, 40),
  ((SELECT id FROM categories WHERE name='Lighting & Decorations' AND parent_category=5), 500, 21000, 40),
  ((SELECT id FROM categories WHERE name='Event Tents & Seating' AND parent_category=5), 1000, 42000, 40),
  ((SELECT id FROM categories WHERE name='Fitness Equipment' AND parent_category=6), 500, 21000, 40),
  ((SELECT id FROM categories WHERE name='Outdoor Sports Gear' AND parent_category=6), 350, 14700, 40),
  ((SELECT id FROM categories WHERE name='Water Sports Gear' AND parent_category=6), 500, 21000, 40),
  ((SELECT id FROM categories WHERE name='Team Sports Equipment' AND parent_category=6), 250, 10500, 40),
  ((SELECT id FROM categories WHERE name='Winter Sports Gear' AND parent_category=6), 700, 29400, 40)
ON DUPLICATE KEY UPDATE median_daily_price=VALUES(median_daily_price),
  median_retail_value=VALUES(median_retail_value), sample_count=VALUES(sample_count);

INSERT INTO platform_policies (policy_key, policy_value) VALUES
  ('booking_workflow', 'Every booking request requires owner approval. Payment confirms an approved booking. The owner records item handover to start the rental; the renter or owner records return to finish it.'),
  ('cancellation', 'A renter may cancel a Pending or Approved booking before payment verification. A booking cannot be cancelled through the self-service flow after payment is verified.'),
  ('deposit_refund', 'Security deposits are held separately from rental charges. After the item is returned, the deposit is eligible for refund when the owner confirms its condition and no open complaint or damage claim applies. This platform simulation does not move real money.'),
  ('late_return', 'Late returns are recorded in rental history. The configured late fee is the product daily price multiplied by the configured LATE_PENALTY_MULTIPLIER for each late day.')
ON DUPLICATE KEY UPDATE policy_value = VALUES(policy_value);
