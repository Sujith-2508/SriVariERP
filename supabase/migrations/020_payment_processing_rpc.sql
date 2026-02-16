-- Migration: Add payment processing functions for Mobile and Desktop apps
-- This ensures FIFO logic is consistent across all platforms

-- 1. Function to get next receipt number
CREATE OR REPLACE FUNCTION get_next_receipt_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
    receipt_ref TEXT;
BEGIN
    SELECT COUNT(*) + 1 INTO next_num FROM transactions WHERE type = 'PAYMENT';
    receipt_ref := 'R' || LPAD(next_num::TEXT, 3, '0');
    RETURN receipt_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_next_receipt_number() TO authenticated, anon;

-- 2. Function to record payment and apply FIFO allocation
CREATE OR REPLACE FUNCTION record_payment_fifo(
    p_customer_id UUID,
    p_amount DECIMAL,
    p_payment_mode TEXT,
    p_agent_name TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_receipt_id UUID;
    v_receipt_ref TEXT;
    v_remaining_amount DECIMAL := p_amount;
    v_invoice RECORD;
    v_applied_amount DECIMAL;
    v_invoice_paid DECIMAL;
    v_result JSON;
BEGIN
    -- Get next receipt number
    v_receipt_ref := get_next_receipt_number();

    -- 1. Insert payment transaction
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

    -- 2. Apply FIFO logic to invoices
    -- Find unpaid invoices sorted by date
    FOR v_invoice IN (
        SELECT t.id, t.reference_id, t.amount, COALESCE(paid.total_paid, 0) as amount_already_paid
        FROM transactions t
        LEFT JOIN (
            SELECT invoice_id, SUM(amount) AS total_paid
            FROM payment_allocations
            GROUP BY invoice_id
        ) paid ON t.id = paid.invoice_id
        WHERE t.customer_id = p_customer_id
          AND t.type = 'INVOICE'
          AND (t.amount - COALESCE(paid.total_paid, 0)) > 0
        ORDER BY t.date ASC
    ) LOOP
        EXIT WHEN v_remaining_amount <= 0;

        v_applied_amount := LEAST(v_remaining_amount, v_invoice.amount - v_invoice.amount_already_paid);
        
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

        v_remaining_amount := v_remaining_amount - v_applied_amount;
    END LOOP;

    -- 3. Update dealer balance
    UPDATE dealers
    SET balance = balance - p_amount,
        last_transaction_date = NOW()
    WHERE id = p_customer_id;

    -- Return result
    v_result := json_build_object(
        'success', true,
        'receipt_id', v_receipt_id,
        'receipt_ref', v_receipt_ref,
        'amount_applied', p_amount
    );

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_payment_fifo(UUID, DECIMAL, TEXT, TEXT, TEXT) TO authenticated, anon;
