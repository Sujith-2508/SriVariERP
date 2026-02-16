-- Comprehensive Fix for Payment Processing and Agent Authentication
-- Run this in Supabase SQL Editor

-- 1. Corrected Agent Authentication RPC
CREATE OR REPLACE FUNCTION authenticate_agent(
    p_agent_id TEXT,
    p_password TEXT
)
RETURNS JSON AS $$
DECLARE
    v_agent RECORD;
BEGIN
    SELECT 
        id as db_id, -- The UUID
        agent_id,    -- The human ID (A2, etc)
        name,
        assigned_district,
        monthly_target,
        phone
    FROM agents
    WHERE agent_id = p_agent_id AND password = p_password AND is_active = TRUE
    INTO v_agent;

    IF v_agent.db_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN json_build_object(
        'id', v_agent.db_id,
        'agent_id', v_agent.agent_id,
        'name', v_agent.name,
        'assigned_district', v_agent.assigned_district,
        'monthly_target', v_agent.monthly_target,
        'phone', v_agent.phone
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Corrected Payment Processing RPC (Fixing UUID/1 conflict)
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
    v_next_num INTEGER; -- Use integer for numeric increment
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

    -- Insert the payment transaction
    -- date is NOW()
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
        COALESCE(p_notes, 'via ' || p_payment_mode),
        p_agent_name,
        NOW()
    ) RETURNING id INTO v_receipt_id;

    -- Apply FIFO logic
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
        ORDER BY t.date ASC, t.created_at ASC
    ) LOOP
        EXIT WHEN v_remaining_payment <= 0;

        v_applied_amount := LEAST(v_remaining_payment, v_invoice.pending);
        
        INSERT INTO payment_allocations (
            invoice_id,
            invoice_ref,
            receipt_id,
            receipt_ref,
            amount,
            date,
            agent_name
        ) VALUES (
            v_invoice.id,
            v_invoice.reference_id,
            v_receipt_id,
            v_receipt_ref,
            v_applied_amount,
            NOW(),
            p_agent_name
        );

        v_remaining_payment := v_remaining_payment - v_applied_amount;
    END LOOP;

    -- Update balance
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

-- 3. Grant permissions
GRANT EXECUTE ON FUNCTION authenticate_agent(TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION record_payment_fifo(UUID, DECIMAL, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
