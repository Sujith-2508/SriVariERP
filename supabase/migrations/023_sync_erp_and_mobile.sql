-- Migration: Sync Mobile App with Desktop ERP (Align Views and RPC)
-- This fix ensures data consistency between Mobile, Desktop app, and Database.

-- ============================================
-- 1. DROP OLD FUNCTIONS (Reset for return type change)
-- ============================================
DROP FUNCTION IF EXISTS record_payment_fifo(uuid,decimal,text,text,text);
DROP FUNCTION IF EXISTS get_next_receipt_number();

-- ============================================
-- 2. ALIGN VIEW: mobile_invoice_view
-- Align names with Kotlin com.example.sve_agent.data.model.UnpaidBill
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
    EXTRACT(DAY FROM (t.due_date - NOW()))::INTEGER AS days_to_due,
    CASE 
        WHEN t.due_date < NOW() THEN 'OVERDUE'
        WHEN t.due_date <= NOW() + INTERVAL '7 days' THEN 'DUE_SOON'
        ELSE 'NORMAL'
    END AS status,
    -- Amount Paid should be derived from allocations
    COALESCE(paid.total_paid, 0) AS amount_paid,
    -- Outstanding balance (Pending)
    (t.amount - COALESCE(paid.total_paid, 0)) AS pending_amount, -- Matches @SerialName("pending_amount")
    t.created_at
FROM transactions t
JOIN dealers d ON t.customer_id = d.id
LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS total_paid
    FROM payment_allocations
    GROUP BY invoice_id
) paid ON t.id = paid.invoice_id
WHERE t.type = 'INVOICE'
  AND (t.amount - COALESCE(paid.total_paid, 0)) > 0
ORDER BY t.created_at ASC;

-- ============================================
-- 3. ALIGN VIEW: mobile_dealers_view
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
-- 4. RPC FIX: record_payment_fifo
-- Now updates both transactions and the desktop's 'bill_payments' table
-- ============================================
CREATE OR REPLACE FUNCTION record_payment_fifo(
    p_customer_id UUID,
    p_amount DECIMAL,
    p_payment_mode TEXT,
    p_agent_name TEXT DEFAULT 'Admin',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_receipt_id UUID;
    v_receipt_ref TEXT;
    v_next_num INTEGER;
    v_remaining_payment DECIMAL;
    v_applied_amount DECIMAL;
    v_invoice RECORD;
BEGIN
    -- Validation
    IF p_amount <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Amount must be greater than zero');
    END IF;

    -- Generate Receipt Reference (R001, R002, etc)
    SELECT COALESCE(MAX(SUBSTRING(reference_id FROM 2)::INTEGER), 0) + 1 
    INTO v_next_num 
    FROM transactions 
    WHERE type = 'PAYMENT' AND reference_id ~ '^R[0-9]+$';
    
    v_receipt_ref := 'R' || LPAD(v_next_num::TEXT, 3, '0');

    -- Keep a local counter for uniqueness if needed (Optional)
    
    -- 1. Insert the payment transaction
    INSERT INTO transactions (
        customer_id,
        type,
        amount,
        date,
        reference_id,
        notes,
        agent_name,
        collection_date
    ) VALUES (
        p_customer_id,
        'PAYMENT',
        p_amount,
        NOW(),
        v_receipt_ref,
        COALESCE(p_notes, 'Collected via ' || p_payment_mode),
        p_agent_name,
        NOW()
    ) RETURNING id INTO v_receipt_id;

    -- 2. Apply FIFO logic and update BOTH tables (Transactional sync)
    v_remaining_payment := p_amount;
    
    FOR v_invoice IN (
        -- Select all pending invoices for this customer
        SELECT t.id, t.reference_id, (t.amount - COALESCE(paid.total, 0)) as pending
        FROM transactions t
        LEFT JOIN (
            SELECT invoice_id, SUM(amount) AS total 
            FROM payment_allocations 
            GROUP BY invoice_id
        ) paid ON t.id = paid.invoice_id
        WHERE t.customer_id = p_customer_id 
          AND t.type = 'INVOICE'
          AND (t.amount - COALESCE(paid.total, 0)) > 0
        ORDER BY t.created_at ASC
    ) LOOP
        EXIT WHEN v_remaining_payment <= 0;

        v_applied_amount := LEAST(v_remaining_payment, v_invoice.pending);
        
        -- A. Create allocation record (Mobile UI depends on this)
        INSERT INTO payment_allocations (
            invoice_id, invoice_ref, receipt_id, receipt_ref, 
            amount, date, agent_name
        ) VALUES (
            v_invoice.id, v_invoice.reference_id, v_receipt_id, v_receipt_ref, 
            v_applied_amount, NOW(), p_agent_name
        );

        -- B. Update bill_payments table (Desktop App source of truth)
        -- This ensures the desktop app sees the balance change
        UPDATE bill_payments 
        SET paid_amount = COALESCE(paid_amount, 0) + v_applied_amount,
            balance_amount = COALESCE(balance_amount, 0) - v_applied_amount,
            payment_status = CASE 
                WHEN (COALESCE(balance_amount, 0) - v_applied_amount) <= 0 THEN 'PAID'
                ELSE 'PARTIAL'
            END,
            updated_at = NOW()
        WHERE invoice_id = v_invoice.id;

        v_remaining_payment := v_remaining_payment - v_applied_amount;
    END LOOP;

    -- 3. Update dealer's master balance
    UPDATE dealers SET balance = balance - p_amount WHERE id = p_customer_id;

    RETURN json_build_object(
        'success', true,
        'receipt_ref', v_receipt_ref,
        'receipt_id', v_receipt_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. GRANT PERMISSIONS
-- ============================================
GRANT SELECT ON mobile_invoice_view TO authenticated, anon, service_role;
GRANT SELECT ON mobile_dealers_view TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION record_payment_fifo(UUID, DECIMAL, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
