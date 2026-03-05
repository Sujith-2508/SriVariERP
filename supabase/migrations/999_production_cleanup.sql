-- Production Readiness Cleanup Script
-- DANGER: This wipes all production transaction data.
-- preserving: products, suppliers (as requested).
-- preserving: agents (user didn't explicitly ask but usually agents stay).

-- 1. Wipe Financial Transactions (Order matters for FKs)
TRUNCATE TABLE payment_allocations CASCADE;
TRUNCATE TABLE bill_payments CASCADE;
TRUNCATE TABLE invoice_items CASCADE;
TRUNCATE TABLE transactions CASCADE;

-- 2. Wipe Dealers (Customers)
TRUNCATE TABLE dealers CASCADE;

-- 3. Reset Sequences if needed (reference_id counts)
-- If we use counts in the app (like R001), next insert will be R001 because MAX(...) + 1 will be 1.

-- Verify
SELECT 'Dealers' as table, COUNT(*) FROM dealers
UNION ALL
SELECT 'Transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'Bill Payments', COUNT(*) FROM bill_payments;
