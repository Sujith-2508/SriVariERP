-- Migration: Add views for Collection Agent Mobile App
-- Run this in Supabase SQL Editor
-- This will allow the mobile app to see invoices, dealers, and outstanding balances in real-time

-- ============================================
-- 1. VIEW: Mobile Invoice View
-- Shows all invoices with company details and days remaining until due
-- ============================================
CREATE OR REPLACE VIEW mobile_invoice_view AS
SELECT 
    t.id,
    t.reference_id AS invoice_no,
    t.amount AS invoice_amount,
    t.date AS invoice_date,
    d.id AS dealer_id,
    d.business_name AS company_name,
    d.city,
    d.address,
    d.phone,
    d.gst_number,
    t.credit_days,
    t.due_date,
    -- Calculate days remaining (negative if overdue)
    EXTRACT(DAY FROM (t.due_date - NOW()))::INTEGER AS days_to_due,
    -- Status based on due date
    CASE 
        WHEN t.due_date < NOW() THEN 'OVERDUE'
        WHEN t.due_date <= NOW() + INTERVAL '7 days' THEN 'DUE_SOON'
        ELSE 'NORMAL'
    END AS status,
    -- Calculate outstanding balance (invoice amount - payments made)
    (t.amount - COALESCE(paid.total_paid, 0)) AS outstanding_balance,
    COALESCE(paid.total_paid, 0) AS amount_paid,
    t.created_at
FROM transactions t
JOIN dealers d ON t.customer_id = d.id
LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS total_paid
    FROM payment_allocations
    GROUP BY invoice_id
) paid ON t.id = paid.invoice_id
WHERE t.type = 'INVOICE'
  AND (t.amount - COALESCE(paid.total_paid, 0)) > 0  -- Only unpaid/partially paid invoices
ORDER BY t.due_date ASC;  -- FIFO: oldest due date first

-- ============================================
-- 2. VIEW: Company Outstanding Balance View
-- Shows total outstanding balance per company/dealer
-- ============================================
CREATE OR REPLACE VIEW company_outstanding_view AS
SELECT 
    d.id AS dealer_id,
    d.business_name AS company_name,
    d.contact_person,
    d.city,
    d.district,
    d.address,
    d.phone,
    d.gst_number,
    COUNT(DISTINCT t.id) AS pending_invoices,
    SUM(t.amount - COALESCE(pa.paid, 0)) AS outstanding_balance,
    MIN(t.due_date) AS earliest_due_date,
    -- Count overdue invoices
    COUNT(DISTINCT CASE WHEN t.due_date < NOW() THEN t.id END) AS overdue_invoices
FROM dealers d
JOIN transactions t ON d.id = t.customer_id AND t.type = 'INVOICE'
LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS paid
    FROM payment_allocations
    GROUP BY invoice_id
) pa ON t.id = pa.invoice_id
WHERE (t.amount - COALESCE(pa.paid, 0)) > 0  -- Only companies with outstanding balance
GROUP BY d.id, d.business_name, d.contact_person, d.city, d.district, d.address, d.phone, d.gst_number
ORDER BY outstanding_balance DESC;

-- ============================================
-- 3. VIEW: All Dealers View (for mobile app sync)
-- Shows all dealers/companies
-- ============================================
CREATE OR REPLACE VIEW mobile_dealers_view AS
SELECT 
    d.id,
    d.business_name AS company_name,
    d.contact_person,
    d.phone,
    d.city,
    d.district,
    d.pin_code,
    d.address,
    d.gst_number,
    d.balance,
    d.last_transaction_date,
    d.created_at
FROM dealers d
ORDER BY d.business_name ASC;

-- ============================================
-- 4. Add receipt_image_url field for WhatsApp sharing
-- ============================================
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS receipt_image_url TEXT;

COMMENT ON COLUMN transactions.receipt_image_url IS 'URL to receipt image for WhatsApp sharing';

-- ============================================
-- 5. Grant access to views (for authenticated users)
-- ============================================
GRANT SELECT ON mobile_invoice_view TO authenticated;
GRANT SELECT ON company_outstanding_view TO authenticated;
GRANT SELECT ON mobile_dealers_view TO authenticated;

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON VIEW mobile_invoice_view IS 'Invoice data for collection agent mobile app - includes company name, amount, days to due, outstanding balance';
COMMENT ON VIEW company_outstanding_view IS 'Outstanding balance summary per company for FIFO collection';
COMMENT ON VIEW mobile_dealers_view IS 'All dealers/companies for mobile app sync';
