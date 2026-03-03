-- 1. Add sync tracking columns to transactions and dealers tables
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS synced_to_sheet BOOLEAN DEFAULT FALSE;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS synced_to_sheet BOOLEAN DEFAULT FALSE;

-- 2. Update existing desktop transactions to true (assuming they were synced)
UPDATE transactions SET synced_to_sheet = TRUE WHERE source = 'DESKTOP';
UPDATE dealers SET synced_to_sheet = TRUE; 

-- 3. Update record_payment_fifo to handle synced_to_sheet status and correctly sync with Desktop Ledger
CREATE OR REPLACE FUNCTION record_payment_fifo(
    p_customer_id UUID,
    p_amount DECIMAL,
    p_payment_mode TEXT,
    p_agent_name TEXT DEFAULT 'Admin',
    p_notes TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'DESKTOP'
)
RETURNS JSON AS $$
DECLARE
    v_receipt_id UUID;
    v_receipt_ref TEXT;
    v_next_num INTEGER;
    v_remaining_payment DECIMAL;
    v_applied_amount DECIMAL;
    v_invoice RECORD;
    v_synced_status BOOLEAN;
BEGIN
    -- Validation
    IF p_amount <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Amount must be greater than zero');
    END IF;

    -- Set sync status: only desktop actions are synced immediately by the app
    v_synced_status := (p_source = 'DESKTOP');

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
        source,
        synced_to_sheet -- NEW COLUMN
    ) VALUES (
        p_customer_id,
        'PAYMENT',
        p_amount,
        NOW(),
        v_receipt_ref,
        COALESCE(p_notes, 'Collected via ' || p_payment_mode),
        p_agent_name,
        NOW(),
        p_source,
        v_synced_status
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
        
        -- A. Create allocation record (Core Business Logic)
        INSERT INTO payment_allocations (
            invoice_id, invoice_ref, receipt_id, receipt_ref, 
            amount, date, agent_name
        ) VALUES (
            v_invoice.id, v_invoice.reference_id, v_receipt_id, v_receipt_ref, 
            v_applied_amount, NOW(), p_agent_name
        );

        -- B. Sync with Desktop ERP Ledger (bill_payments table)
        -- Critical: Using correct column names (bill_number) and INSERT logic as per ERP design
        BEGIN
            INSERT INTO bill_payments (
                bill_number, 
                receipt_number, 
                amount_applied, 
                payment_date, 
                payment_mode
            ) VALUES (
                v_invoice.reference_id, 
                v_receipt_ref, 
                v_applied_amount, 
                NOW(), 
                p_payment_mode
            );
        EXCEPTION WHEN OTHERS THEN
            -- Safe block: Don't let side-ledger issues break the main payment
            RAISE WARNING 'Sync to bill_payments failed: %', SQLERRM;
        END;

        v_remaining_payment := v_remaining_payment - v_applied_amount;
    END LOOP;

    -- 3. Update dealer's master balance
    UPDATE dealers SET balance = balance - p_amount WHERE id = p_customer_id;

    -- 4. Mark dealer as unsynced for Sheet Backup if payment came from mobile
    -- This ensures the desktop background worker picks it up and updates Google Sheets
    IF p_source = 'MOBILE' THEN
       UPDATE dealers SET synced_to_sheet = FALSE WHERE id = p_customer_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'receipt_ref', v_receipt_ref,
        'receipt_id', v_receipt_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
