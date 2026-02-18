-- Migration to ensure all product fields exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'nos';

COMMENT ON COLUMN products.cost_price IS 'Purchase price of the product for profit calculation';
COMMENT ON COLUMN products.hsn_code IS 'Harmonized System of Nomenclature code';
COMMENT ON COLUMN products.unit IS 'Unit of measurement (e.g., kg, nos, set)';
