-- Migration: Align View Column Names with Mobile App Models
-- This ensures that Supabase Postgrest responses map correctly to Kotlin @SerialName tags

-- ============================================
-- 1. UPDATE: mobile_invoice_view
-- Align names with com.example.sve_agent.data.model.UnpaidBill
-- ============================================
CREATE OR REPLACE VIEW mobile_invoice_view AS
SELECT 
    t.id,
    t.reference_id AS bill_number,        -- Matches @SerialName("bill_number")
    t.amount AS amount,                  -- Matches @SerialName("amount")
    t.date AS bill_date,                 -- Matches @SerialName("bill_date")
    d.id AS dealer_id,                   -- Matches @SerialName("dealer_id")
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
    (t.amount - COALESCE(paid.total_paid, 0)) AS pending_amount, -- Matches @SerialName("pending_amount")
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
ORDER BY t.created_at ASC; -- Standard FIFO order

-- ============================================
-- 2. UPDATE: mobile_dealers_view
-- Align names with com.example.sve_agent.data.model.Customer
-- ============================================
CREATE OR REPLACE VIEW mobile_dealers_view AS
SELECT 
    d.id,
    d.business_name,                      -- Matches @SerialName("business_name")
    d.contact_person,                     -- Matches @SerialName("contact_person")
    d.phone,
    d.city,
    d.district,                           -- Matches @SerialName("district")
    d.pin_code,
    d.address,
    d.gst_number,
    d.balance,
    d.last_transaction_date,
    d.created_at
FROM dealers d
ORDER BY d.business_name ASC;

-- ============================================
-- 3. UPDATE: company_outstanding_view
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
    COUNT(DISTINCT CASE WHEN t.due_date < NOW() THEN t.id END) AS overdue_invoices
FROM dealers d
JOIN transactions t ON d.id = t.customer_id AND t.type = 'INVOICE'
LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS paid
    FROM payment_allocations
    GROUP BY invoice_id
) pa ON t.id = pa.invoice_id
WHERE (t.amount - COALESCE(pa.paid, 0)) > 0
GROUP BY d.id, d.business_name, d.contact_person, d.city, d.district, d.address, d.phone, d.gst_number
ORDER BY outstanding_balance DESC;

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================
GRANT SELECT ON mobile_invoice_view TO authenticated, anon, service_role;
GRANT SELECT ON mobile_dealers_view TO authenticated, anon, service_role;
GRANT SELECT ON company_outstanding_view TO authenticated, anon, service_role;
