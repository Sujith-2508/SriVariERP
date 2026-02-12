-- Migrate existing invoice data from mobile_invoice_view to bill_payments
-- This populates bill_payments with all existing invoices

-- Step 1: Migrate unpaid/partially paid invoices from mobile_invoice_view
-- These will have NULL receipt_number since no payment has been made
INSERT INTO bill_payments (
    receipt_number,
    bill_number,
    amount_applied,
    payment_date,
    payment_mode
)
SELECT 
    NULL as receipt_number,  -- No receipt yet for unpaid invoices
    invoice_no as bill_number,
    COALESCE(amount_paid, 0) as amount_applied,  -- Amount already paid (if any)
    invoice_date::date as payment_date,  -- Use invoice date as placeholder
    CASE 
        WHEN COALESCE(amount_paid, 0) > 0 THEN 'Cash'  -- If partially paid, assume Cash
        ELSE NULL 
    END as payment_mode
FROM mobile_invoice_view
WHERE outstanding_balance > 0;  -- Only unpaid or partially paid invoices

-- Step 2: Migrate payment allocations (links receipts to invoices)
-- This creates records for each payment applied to each invoice via FIFO
INSERT INTO bill_payments (
    receipt_number,
    bill_number,
    amount_applied,
    payment_date,
    payment_mode
)
SELECT 
    pa.receipt_ref as receipt_number,
    pa.invoice_ref as bill_number,
    pa.amount as amount_applied,
    pa.date::date as payment_date,
    'Cash' as payment_mode  -- Default payment mode
FROM payment_allocations pa
WHERE pa.invoice_ref IS NOT NULL 
  AND pa.receipt_ref IS NOT NULL;

-- Verification Queries (uncomment to run)
-- Check total records migrated
-- SELECT COUNT(*) as total_records FROM bill_payments;

-- Check unpaid invoices (should match mobile_invoice_view count)
-- SELECT COUNT(*) as unpaid_invoices 
-- FROM bill_payments 
-- WHERE receipt_number IS NULL;

-- Check paid invoices
-- SELECT COUNT(*) as paid_invoices 
-- FROM bill_payments 
-- WHERE receipt_number IS NOT NULL;

-- View sample data
-- SELECT * FROM bill_payments ORDER BY payment_date DESC LIMIT 20;

-- Check for any invoices not migrated
-- SELECT invoice_no 
-- FROM mobile_invoice_view 
-- WHERE invoice_no NOT IN (SELECT DISTINCT bill_number FROM bill_payments);

