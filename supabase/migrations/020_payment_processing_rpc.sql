-- Add sequential receipt numbering and atomic FIFO payment processing
-- This script ensures consistent behavior across desktop and mobile apps

-- 1. Helper to get next receipt number
CREATE OR REPLACE FUNCTION get_next_receipt_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
    receipt_ref TEXT;
BEGIN
    -- Use a sequence or count-based approach for simplicity in this ERP
    SELECT COALESCE(MAX(SUBSTRING(reference_id FROM 2)::INTEGER), 0) + 1 
    INTO next_num 
    FROM transactions 
    WHERE type = 'PAYMENT' AND reference_id ~ '^R[0-9]+$';
    
    receipt_ref := 'R' || LPAD(next_num::TEXT, 3, '0');
    RETURN receipt_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atomic RPC for Recording Payment and FIFO Allocation
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
    v_remaining_payment DECIMAL;
    v_applied_amount DECIMAL;
    v_invoice RECORD;
    v_result JSON;
BEGIN
    -- 0. Basic Validation
    IF p_amount <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Amount must be greater than zero');
    END IF;

    -- 1. Generate Receipt Reference
    v_receipt_ref := get_next_receipt_number();
    
    -- 2. Insert payment transaction
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

    -- 3. Apply FIFO logic to invoices
    v_remaining_payment := p_amount;
    
    -- Loop through all unpaid/partially paid invoices starting from the oldest
    FOR v_invoice IN (
        SELECT t.id, t.reference_id, (t.amount - COALESCE(paid.total_paid, 0)) as pending_balance
        FROM transactions t
        LEFT JOIN (
            SELECT invoice_id, SUM(amount) AS total_paid 
            FROM payment_allocations 
            GROUP BY invoice_id
        ) paid ON t.id = paid.invoice_id
        WHERE t.customer_id = p_customer_id 
          AND t.type = 'INVOICE'
          AND (t.amount - COALESCE(paid.total_paid, 0)) > 0
        ORDER BY t.date ASC, t.created_at ASC
    ) LOOP
        -- Stop if no more payment to distribute
        EXIT WHEN v_remaining_payment <= 0;

        v_applied_amount := LEAST(v_remaining_payment, v_invoice.pending_balance);
        
        -- Insert allocation
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

    -- 4. Update dealer balance (deduct the payment amount)
    UPDATE dealers
    SET balance = balance - p_amount,
        last_transaction_date = NOW()
    WHERE id = p_customer_id;

    -- Return result
    v_result := json_build_object(
        'success', true,
        'receipt_id', v_receipt_id,
        'receipt_ref', v_receipt_ref,
        'amount_applied', p_amount,
        'balance_remaining', v_remaining_payment
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    -- Return error message
    RETURN json_build_object(
        'success', false, 
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions explicitly
GRANT EXECUTE ON FUNCTION get_next_receipt_number() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION record_payment_fifo(UUID, DECIMAL, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;

-- Ensure tables are accessible
GRANT ALL ON transactions TO anon, authenticated, service_role;
GRANT ALL ON payment_allocations TO anon, authenticated, service_role;
GRANT ALL ON dealers TO anon, authenticated, service_role;
