-- ============================================================
-- SRI VARI ERP — FULL OPERATIONAL DATA WIPE
-- Wipes: Dealers, Invoices, Receipts, Payments, Agents
-- Keeps: Products, Company Settings, Admin Users
-- ============================================================
-- ⚠️  RUN THIS IN SUPABASE → SQL EDITOR
-- ⚠️  ORDER MATTERS — follows foreign key dependency chain
-- ============================================================

BEGIN;

-- ── STEP 1: Child tables of transactions (must go first) ───
DELETE FROM payment_allocations;
DELETE FROM invoice_items;
DELETE FROM bill_payments;

-- ── STEP 2: All Transactions (Invoices + Receipts/Payments) ─
DELETE FROM transactions;

-- ── STEP 3: Dealers ────────────────────────────────────────
DELETE FROM dealers;

-- ── STEP 4: Agent operational data ────────────────────────
--    (attendance, locations, status, salaries — agent field data)
DELETE FROM attendance;
DELETE FROM agent_locations;
DELETE FROM agent_status;
DELETE FROM agent_salaries;

-- ── STEP 5: Agents themselves ──────────────────────────────
--    (the agent profiles + their mobile login users)
DELETE FROM agents;

-- ── STEP 6: Clear mobile app users (agent logins) ─────────
--    Keeps: SVadmin (ERP admin desktop user)
DELETE FROM users WHERE username != 'SVadmin';

-- ── STEP 7: Purchase / Supplier data ──────────────────────
--   (must delete children before parents)
DELETE FROM purchase_allocations;
DELETE FROM purchase_payments;
DELETE FROM purchase_bills;
DELETE FROM suppliers;

-- ── STEP 8: Reset sequences / auto-counters ────────────────
-- Invoice numbers are calculated from transaction count in code
-- so clearing transactions automatically resets them to 001.
-- No manual sequence reset needed.

-- ============================================================
-- ✅ WHAT WAS NOT TOUCHED:
--   • products         (your product catalog stays intact)
--   • company_settings (your company profile stays intact)
--   • users (SVadmin)  (desktop ERP login stays intact)
-- ============================================================

COMMIT;

-- ── VERIFICATION — Run these after the wipe to confirm ─────
SELECT 'dealers'           AS table_name, COUNT(*) AS remaining FROM dealers
UNION ALL
SELECT 'transactions',       COUNT(*) FROM transactions
UNION ALL
SELECT 'invoice_items',      COUNT(*) FROM invoice_items
UNION ALL
SELECT 'payment_allocations',COUNT(*) FROM payment_allocations
UNION ALL
SELECT 'bill_payments',      COUNT(*) FROM bill_payments
UNION ALL
SELECT 'agents',             COUNT(*) FROM agents
UNION ALL
SELECT 'agent_status',       COUNT(*) FROM agent_status
UNION ALL
SELECT 'agent_locations',    COUNT(*) FROM agent_locations
UNION ALL
SELECT 'attendance',         COUNT(*) FROM attendance
UNION ALL
SELECT 'agent_salaries',     COUNT(*) FROM agent_salaries
UNION ALL
SELECT 'suppliers',          COUNT(*) FROM suppliers
UNION ALL
SELECT 'purchase_bills',     COUNT(*) FROM purchase_bills
UNION ALL
SELECT 'purchase_payments',  COUNT(*) FROM purchase_payments
UNION ALL
SELECT 'purchase_allocations',COUNT(*) FROM purchase_allocations
UNION ALL
SELECT '--- KEPT INTACT ---',  0
UNION ALL
SELECT 'products',           COUNT(*) FROM products
UNION ALL
SELECT 'company_settings',   COUNT(*) FROM company_settings
UNION ALL
SELECT 'users (SVadmin only)',COUNT(*) FROM users;
