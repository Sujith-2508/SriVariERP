-- Add hsn_code and unit columns to products table
ALTER TABLE products 
ADD COLUMN hsn_code TEXT,
ADD COLUMN unit TEXT DEFAULT 'nos';

-- Comment on columns
COMMENT ON COLUMN products.hsn_code IS 'Harmonized System of Nomenclature code';
COMMENT ON COLUMN products.unit IS 'Unit of measurement (e.g., kg, nos, set)';
