-- Migration: Add p_source to record_payment_fifo for Desktop/Mobile sync
-- Sets source of transaction so Desktop App can identify background changes to sync to Sheets.

DROP FUNCTION IF EXISTS record_payment_fifo(uuid,decimal,text,text,text);

CREATE OR REPLACE FUNCTION record_payment_fifo(
    p_customer_id UUID,
    p_amount DECIMAL,
    p_payment_mode TEXT,
    p_agent_name TEXT DEFAULT 'Admin',
    p_notes TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'DESKTOP' -- New parameter
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

    -- 1. Insert the payment transaction
    INSERT INTO transactions (
        customer_id,
        type,
        amount,
        date,
        reference_id,
        notes,
        agent_name,
        collection_date,
        source -- Using the new column from migration 009
    ) VALUES (
        p_customer_id,
        'PAYMENT',
        p_amount,
        NOW(),
        v_receipt_ref,
        COALESCE(p_notes, 'Collected via ' || p_payment_mode),
        p_agent_name,
        NOW(),
        p_source
    ) RETURNING id INTO v_receipt_id;

    -- 2. Apply FIFO logic
    v_remaining_payment := p_amount;
    
    FOR v_invoice IN (
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
        
        -- Create allocation record
        INSERT INTO payment_allocations (
            invoice_id, invoice_ref, receipt_id, receipt_ref, 
            amount, date, agent_name
        ) VALUES (
            v_invoice.id, v_invoice.reference_id, v_receipt_id, v_receipt_ref, 
            v_applied_amount, NOW(), p_agent_name
        );

        -- Update bill_payments table (Desktop App source of truth)
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

GRANT EXECUTE ON FUNCTION record_payment_fifo(UUID, DECIMAL, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
