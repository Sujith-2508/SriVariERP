-- Create bill_payments table to store invoice metadata and payment tracking
-- This table stores detailed invoice information for FIFO payment allocation

CREATE TABLE IF NOT EXISTS bill_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Invoice Reference
    invoice_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    invoice_ref TEXT NOT NULL,
    
    -- Dealer Information
    dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
    dealer_name TEXT NOT NULL,
    
    -- Invoice Details
    invoice_date TIMESTAMPTZ NOT NULL,
    due_date TIMESTAMPTZ,
    credit_days INTEGER DEFAULT 30,
    
    -- Financial Details
    invoice_amount DECIMAL(12, 2) NOT NULL,
    paid_amount DECIMAL(12, 2) DEFAULT 0,
    balance_amount DECIMAL(12, 2) NOT NULL,
    
    -- Payment Status
    payment_status TEXT CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')) DEFAULT 'UNPAID',
    
    -- Additional Invoice Metadata
    vehicle_name TEXT,
    vehicle_number TEXT,
    destination TEXT,
    transport_charges DECIMAL(10, 2) DEFAULT 0,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    
    -- Tax Information
    total_cgst DECIMAL(10, 2) DEFAULT 0,
    total_sgst DECIMAL(10, 2) DEFAULT 0,
    total_igst DECIMAL(10, 2) DEFAULT 0,
    total_tax DECIMAL(10, 2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_amounts CHECK (
        invoice_amount >= 0 AND 
        paid_amount >= 0 AND 
        balance_amount >= 0 AND
        paid_amount <= invoice_amount
    )
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bill_payments_invoice_id ON bill_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_dealer_id ON bill_payments(dealer_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_invoice_ref ON bill_payments(invoice_ref);
CREATE INDEX IF NOT EXISTS idx_bill_payments_payment_status ON bill_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_bill_payments_due_date ON bill_payments(due_date);

-- Enable Row Level Security
ALTER TABLE bill_payments ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated access
CREATE POLICY "Allow all access to bill_payments" ON bill_payments FOR ALL USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_bill_payments_updated_at 
    BEFORE UPDATE ON bill_payments
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE bill_payments IS 'Stores invoice metadata and payment tracking for FIFO allocation';
COMMENT ON COLUMN bill_payments.invoice_id IS 'Reference to the transaction record';
COMMENT ON COLUMN bill_payments.invoice_ref IS 'Invoice number (e.g., INV001)';
COMMENT ON COLUMN bill_payments.balance_amount IS 'Remaining unpaid amount after FIFO allocation';
COMMENT ON COLUMN bill_payments.payment_status IS 'Current payment status: UNPAID, PARTIAL, or PAID';
