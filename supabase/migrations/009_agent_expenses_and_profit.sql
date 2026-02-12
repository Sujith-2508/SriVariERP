-- Migration 009: Agent Expenses and Profit Tracking System
-- This migration adds comprehensive profit tracking and mobile-desktop sync support
-- Note: Suppliers and Purchases are in LocalStorage (desktop only), not in Supabase

-- ============================================================================
-- 1. AGENT ENHANCEMENTS
-- ============================================================================

-- Add monthly salary to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS monthly_salary DECIMAL(10, 2) DEFAULT 0;

COMMENT ON COLUMN agents.monthly_salary IS 'Monthly salary for the agent (shown in expense reports)';

-- ============================================================================
-- 2. TRANSACTION ENHANCEMENTS (Profit Tracking & Source)
-- ============================================================================

-- Add source tracking for receipts (desktop vs mobile)
-- Note: Receipt numbers are sequential (R001, R002, etc.) from Supabase
-- Source field is for analytics only (to track which receipts came from mobile agents)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(10) DEFAULT 'DESKTOP';
-- Values: 'DESKTOP' or 'MOBILE'

COMMENT ON COLUMN transactions.source IS 'Source of transaction: DESKTOP (admin) or MOBILE (agent app) - for analytics only';

-- Add profit tracking fields to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cogs DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS service_charges DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS allocated_agent_expenses DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dealer_discount_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS profit_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS profit_percentage DECIMAL(5, 2) DEFAULT 0;

COMMENT ON COLUMN transactions.cogs IS 'Cost of Goods Sold for this invoice';
COMMENT ON COLUMN transactions.service_charges IS 'Service/transport charges for this invoice';
COMMENT ON COLUMN transactions.allocated_agent_expenses IS 'Agent expenses allocated to this invoice';
COMMENT ON COLUMN transactions.dealer_discount_amount IS 'Discount amount given to dealer';
COMMENT ON COLUMN transactions.profit_amount IS 'Net profit: Revenue - COGS - Service - Agent Expenses - Discount';
COMMENT ON COLUMN transactions.profit_percentage IS 'Profit as percentage of revenue';

-- ============================================================================
-- 3. DEALER ENHANCEMENTS (Profit Tracking)
-- ============================================================================

-- Add dealer-level profit tracking
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS total_profit DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS total_discount_given DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS last_profit_calculation TIMESTAMP;

COMMENT ON COLUMN dealers.total_profit IS 'Total profit earned from this dealer (sum of all invoice profits)';
COMMENT ON COLUMN dealers.total_discount_given IS 'Total discount amount given to this dealer';
COMMENT ON COLUMN dealers.discount_percent IS 'Default discount percentage for this dealer';
COMMENT ON COLUMN dealers.last_profit_calculation IS 'Last time profit was calculated for this dealer';

-- ============================================================================
-- 4. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Transaction indexes
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_transactions_profit ON transactions(profit_amount DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_profit ON transactions(customer_id, profit_amount);

-- ============================================================================
-- 5. VIEWS FOR ANALYTICS
-- ============================================================================

-- Dealer Profit Summary View
CREATE OR REPLACE VIEW dealer_profit_summary AS
SELECT 
    d.id AS dealer_id,
    d.business_name,
    d.discount_percent,
    COUNT(CASE WHEN t.type = 'INVOICE' THEN 1 END) AS total_invoices,
    COALESCE(SUM(CASE WHEN t.type = 'INVOICE' THEN t.amount END), 0) AS total_revenue,
    COALESCE(SUM(CASE WHEN t.type = 'INVOICE' THEN t.profit_amount END), 0) AS total_profit,
    COALESCE(SUM(CASE WHEN t.type = 'INVOICE' THEN t.dealer_discount_amount END), 0) AS total_discount_given,
    CASE 
        WHEN SUM(CASE WHEN t.type = 'INVOICE' THEN t.amount END) > 0 
        THEN (SUM(CASE WHEN t.type = 'INVOICE' THEN t.profit_amount END) / 
              SUM(CASE WHEN t.type = 'INVOICE' THEN t.amount END) * 100)
        ELSE 0 
    END AS overall_profit_percentage
FROM dealers d
LEFT JOIN transactions t ON d.id = t.customer_id
GROUP BY d.id, d.business_name, d.discount_percent;

COMMENT ON VIEW dealer_profit_summary IS 'Summary of profit metrics per dealer';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 009 completed successfully';
    RAISE NOTICE 'Added profit tracking fields to transactions and dealers';
    RAISE NOTICE 'Added source tracking for mobile/desktop receipts';
    RAISE NOTICE 'Created analytics views for profit tracking';
    RAISE NOTICE 'Note: Purchase payment tracking will be added when purchases move to Supabase';
END $$;
