-- Clear all invoice and payment metadata from Supabase
-- This will delete ALL transactions (invoices and payments) and related data

-- Step 1: Delete all payment allocations (FIFO tracking data)
DELETE FROM payment_allocations;

-- Step 2: Delete all invoice items
DELETE FROM invoice_items;

-- Step 3: Delete all transactions (both invoices AND payments)
DELETE FROM transactions;

-- Step 4: Reset dealer balances to 0
UPDATE dealers SET balance = 0, last_transaction_date = NULL;

-- Note: This clears ALL transaction data including invoices and payments
-- Dealer and product data are preserved
 