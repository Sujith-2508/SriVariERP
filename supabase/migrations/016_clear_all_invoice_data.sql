-- Clear all invoice and payment data
-- This deletes data from the underlying tables that mobile_invoice_view uses

-- Step 1: Delete payment allocations (must be first due to foreign keys)
DELETE FROM payment_allocations;

-- Step 2: Delete invoice items
DELETE FROM invoice_items;

-- Step 3: Delete all transactions (invoices and payments)
DELETE FROM transactions WHERE type = 'INVOICE';
DELETE FROM transactions WHERE type = 'PAYMENT';

-- Step 4: Clear bill_payments table
DELETE FROM bill_payments;

-- Step 5: Reset dealer balances to zero
UPDATE dealers 
SET balance = 0, 
    last_transaction_date = NULL;

-- Verification queries (uncomment to check)
-- SELECT COUNT(*) FROM transactions;
-- SELECT COUNT(*) FROM invoice_items;
-- SELECT COUNT(*) FROM payment_allocations;
-- SELECT COUNT(*) FROM bill_payments;
-- SELECT * FROM mobile_invoice_view;  -- Should return 0 rows
-- SELECT business_name, balance FROM dealers;  -- All balances should be 0
