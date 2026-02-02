-- Seed Data for Sri Vari Enterprises
-- Run this in Supabase SQL Editor AFTER running schema.sql

-- Insert Dealers (let Supabase auto-generate UUIDs)
INSERT INTO dealers (business_name, contact_person, phone, district, city, pin_code, address, gst_number, balance)
VALUES 
  ('Royal Kitchen World', 'Rajesh Gupta', '9876543210', 'North District', 'Chennai', '600001', '123, Anna Nagar Main Road', '33AABCU9603R1ZM', 45000),
  ('City Home Needs', 'Amit Kumar', '9876543211', 'Central Market', 'Coimbatore', '641001', '45, RS Puram', NULL, 12500),
  ('Lakshmi Traders', 'Suresh Reddy', '9876543212', 'South Extension', 'Madurai', '625001', NULL, NULL, 0),
  ('Modern Appliances', 'Vikram Singh', '9876543213', 'West Hub', 'Trichy', '620001', '78, Cantonment Area', '33AABCU9603R2ZN', 82000);

-- Insert Products
INSERT INTO products (product_id, name, category, price, stock, gst_rate)
VALUES 
  ('PDI-001', 'Non-Stick Tawa 28cm', 'Cookware', 850, 150, 0.18),
  ('PDI-002', 'Deep Kadai 3L', 'Cookware', 1200, 80, 0.18),
  ('PDI-003', 'Fry Pan 24cm', 'Cookware', 950, 200, 0.18),
  ('PDI-004', 'Pressure Cooker 5L', 'Appliances', 2400, 45, 0.12),
  ('PDI-005', 'Glass Lid Universal', 'Accessories', 350, 500, 0.12);

-- Insert Agents
INSERT INTO agents (name, phone, area, is_active)
VALUES 
  ('Vikram S.', '9876543220', 'North Zone', true),
  ('Rajesh K.', '9876543221', 'South Zone', true),
  ('Amit P.', '9876543222', 'East Zone', true),
  ('Suresh R.', '9876543223', 'West Zone', true);

-- Insert sample Invoice for Royal Kitchen World
INSERT INTO transactions (customer_id, type, amount, date, reference_id, credit_days, due_date)
SELECT id, 'INVOICE', 25000, '2025-06-15', 'INV001', 90, '2025-09-13'
FROM dealers WHERE business_name = 'Royal Kitchen World';

-- Insert sample Payment for Royal Kitchen World  
INSERT INTO transactions (customer_id, type, amount, date, reference_id, notes, agent_name)
SELECT id, 'PAYMENT', 5000, '2025-06-20', 'R001', 'Part payment via Cash', 'Vikram S.'
FROM dealers WHERE business_name = 'Royal Kitchen World';
