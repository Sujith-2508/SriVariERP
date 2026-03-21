-- 1. Add opening_balance_date column to dealers table
-- This ensures user-selected opening balance dates are persisted
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS opening_balance_date DATE;

-- 2. Create 'BAL B/F' (Balance Brought Forward) transactions for existing dealers
-- This converts the "static" opening balance field into a real "Invoice" transaction
-- so that FIFO allocation can track which payments pay it off.
INSERT INTO transactions (customer_id, type, amount, date, reference_id, notes, source, synced_to_sheet)
SELECT 
    id as customer_id, 
    'INVOICE' as type, 
    opening_balance as amount, 
    COALESCE(opening_balance_date, created_at::date) as date,
    'BAL B/F' as reference_id,
    'Opening Balance' as notes,
    'SYSTEM' as source,
    true as synced_to_sheet
FROM dealers
WHERE opening_balance > 0
  AND NOT EXISTS (
    SELECT 1 FROM transactions 
    WHERE customer_id = dealers.id 
      AND reference_id = 'BAL B/F'
  );

-- 3. Update existing records to use the creation date if they have an opening balance but no date
UPDATE dealers 
SET opening_balance_date = DATE(created_at) 
WHERE opening_balance_date IS NULL AND opening_balance != 0;

-- 4. Suppliers (if table exists)
-- Using a DO block to safely check for suppliers table existence
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename  = 'suppliers') THEN
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance_date DATE;
        
        INSERT INTO transactions (customer_id, type, amount, date, reference_id, notes, source, synced_to_sheet)
        SELECT 
            id as customer_id, 
            'INVOICE' as type, 
            opening_balance as amount, 
            COALESCE(opening_balance_date, created_at::date) as date,
            'BAL B/F' as reference_id,
            'Opening Balance' as notes,
            'SYSTEM' as source,
            true as synced_to_sheet
        FROM suppliers
        WHERE opening_balance > 0
          AND NOT EXISTS (
            SELECT 1 FROM transactions 
            WHERE customer_id = suppliers.id 
              AND reference_id = 'BAL B/F'
          );
    END IF;
END $$;
