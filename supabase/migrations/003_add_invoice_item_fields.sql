-- Add hsn_code and unit columns to invoice_items table
ALTER TABLE invoice_items 
ADD COLUMN hsn_code TEXT,
ADD COLUMN unit TEXT DEFAULT 'nos';

-- Comment on columns
COMMENT ON COLUMN invoice_items.hsn_code IS 'Snapshot of HSN Code at time of invoice';
COMMENT ON COLUMN invoice_items.unit IS 'Snapshot of Unit at time of invoice';
