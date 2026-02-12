-- Add cost_price column to products table
ALTER TABLE products 
ADD COLUMN cost_price DECIMAL(10, 2) DEFAULT 0;

-- Comment on column
COMMENT ON COLUMN products.cost_price IS 'Purchase price of the product for profit calculation';
