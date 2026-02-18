-- Migration 029: Fix Invoice Items and Bill Payments Schema
-- This fixes the missing columns in invoice_items and resolves the foreign key violation in bill_payments

-- 1. Fix invoice_items table (Missing columns)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_items' AND column_name='hsn_code') THEN
        ALTER TABLE invoice_items ADD COLUMN hsn_code TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_items' AND column_name='unit') THEN
        ALTER TABLE invoice_items ADD COLUMN unit TEXT DEFAULT 'nos';
    END IF;
    
    -- Also ensure cost_price exists for future use if needed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_items' AND column_name='cost_price') THEN
        ALTER TABLE invoice_items ADD COLUMN cost_price DECIMAL(10, 2) DEFAULT 0;
    END IF;
END $$;

-- 2. Fix bill_payments table (Foreign Key violation and column mismatch)
-- Drop the problematic foreign key constraint if it exists
ALTER TABLE bill_payments DROP CONSTRAINT IF EXISTS bill_payments_bill_number_fkey;

-- Ensure bill_payments has the correct columns for sync
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bill_payments' AND column_name='bill_number') THEN
        ALTER TABLE bill_payments ADD COLUMN bill_number TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bill_payments' AND column_name='receipt_number') THEN
        ALTER TABLE bill_payments ADD COLUMN receipt_number TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bill_payments' AND column_name='amount_applied') THEN
        ALTER TABLE bill_payments ADD COLUMN amount_applied DECIMAL(12, 2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bill_payments' AND column_name='payment_date') THEN
        ALTER TABLE bill_payments ADD COLUMN payment_date DATE DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bill_payments' AND column_name='payment_mode') THEN
        ALTER TABLE bill_payments ADD COLUMN payment_mode TEXT;
    END IF;
END $$;

-- Add index for performance on bill_number
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill_number ON bill_payments(bill_number);

-- Verify migration
COMMENT ON COLUMN invoice_items.hsn_code IS 'Snapshot of HSN Code at time of invoice';
COMMENT ON COLUMN invoice_items.unit IS 'Snapshot of Unit at time of invoice';
COMMENT ON TABLE bill_payments IS 'Stores invoice payment history for mobile-desktop sync';
