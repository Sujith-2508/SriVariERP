-- Drop cost_price column from products table
ALTER TABLE products 
DROP COLUMN IF EXISTS cost_price;
