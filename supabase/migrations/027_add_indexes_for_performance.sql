-- Migration: Add index to invoice_items to prevent hangs during joins
-- This helps performance when fetching transactions with their items

CREATE INDEX IF NOT EXISTS idx_invoice_items_transaction_id ON invoice_items(transaction_id);

-- Also add index to payment_allocations if missing
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_id ON payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_receipt_id ON payment_allocations(receipt_id);

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
