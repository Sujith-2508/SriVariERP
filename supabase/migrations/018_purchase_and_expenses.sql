-- Migration: Purchase Management & Agent Expenses
-- Creates tables for supplier management, purchase tracking, and agent salary/expenses
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. TABLE: suppliers
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    gst_number TEXT,
    balance DECIMAL(12, 2) DEFAULT 0,  -- Credit owed TO supplier (positive = we owe them)
    last_transaction_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. TABLE: purchase_bills
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    bill_number TEXT NOT NULL UNIQUE,
    bill_date DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    paid_amount DECIMAL(12, 2) DEFAULT 0,
    balance DECIMAL(12, 2) NOT NULL,  -- amount - paid_amount
    due_date DATE,
    items JSONB,  -- Array of purchase items
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. TABLE: purchase_payments
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    payment_number TEXT NOT NULL UNIQUE,
    payment_date DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    payment_mode TEXT CHECK (payment_mode IN ('CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'OTHER')),
    reference_number TEXT,  -- Cheque/transaction number
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. TABLE: purchase_allocations (FIFO tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
    bill_number TEXT NOT NULL,
    payment_id UUID NOT NULL REFERENCES purchase_payments(id) ON DELETE CASCADE,
    payment_number TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    allocation_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. TABLE: agent_salaries
-- ============================================
CREATE TABLE IF NOT EXISTS agent_salaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    base_salary DECIMAL(10, 2) NOT NULL,
    travel_expense DECIMAL(10, 2) DEFAULT 0,
    stay_expense DECIMAL(10, 2) DEFAULT 0,
    food_expense DECIMAL(10, 2) DEFAULT 0,
    other_expense DECIMAL(10, 2) DEFAULT 0,
    total_expense DECIMAL(10, 2) DEFAULT 0,  -- Sum of all expenses
    net_salary DECIMAL(10, 2) NOT NULL,  -- base_salary + total_expense
    payment_status TEXT DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID')),
    paid_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, month, year)  -- One salary record per agent per month
);

-- ============================================
-- 6. INDEXES
-- ============================================
-- Suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_balance ON suppliers(balance);

-- Purchase Bills
CREATE INDEX IF NOT EXISTS idx_purchase_bills_supplier ON purchase_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_date ON purchase_bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_balance ON purchase_bills(balance);

-- Purchase Payments
CREATE INDEX IF NOT EXISTS idx_purchase_payments_supplier ON purchase_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_date ON purchase_payments(payment_date);

-- Purchase Allocations
CREATE INDEX IF NOT EXISTS idx_purchase_allocations_bill ON purchase_allocations(bill_id);
CREATE INDEX IF NOT EXISTS idx_purchase_allocations_payment ON purchase_allocations(payment_id);

-- Agent Salaries
CREATE INDEX IF NOT EXISTS idx_agent_salaries_agent ON agent_salaries(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_salaries_month_year ON agent_salaries(month, year);
CREATE INDEX IF NOT EXISTS idx_agent_salaries_status ON agent_salaries(payment_status);

-- ============================================
-- 7. TRIGGERS
-- ============================================

-- Auto-calculate total_expense and net_salary for agent_salaries
CREATE OR REPLACE FUNCTION calculate_salary_totals()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_expense = COALESCE(NEW.travel_expense, 0) + 
                       COALESCE(NEW.stay_expense, 0) + 
                       COALESCE(NEW.food_expense, 0) + 
                       COALESCE(NEW.other_expense, 0);
    NEW.net_salary = NEW.base_salary + NEW.total_expense;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_salary_trigger BEFORE INSERT OR UPDATE ON agent_salaries
    FOR EACH ROW EXECUTE FUNCTION calculate_salary_totals();

-- ============================================
-- 8. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to suppliers" ON suppliers FOR ALL USING (true);
CREATE POLICY "Allow all access to purchase_bills" ON purchase_bills FOR ALL USING (true);
CREATE POLICY "Allow all access to purchase_payments" ON purchase_payments FOR ALL USING (true);
CREATE POLICY "Allow all access to purchase_allocations" ON purchase_allocations FOR ALL USING (true);
CREATE POLICY "Allow all access to agent_salaries" ON agent_salaries FOR ALL USING (true);

-- ============================================
-- 9. COMMENTS
-- ============================================
COMMENT ON TABLE suppliers IS 'Supplier master data with credit balance tracking';
COMMENT ON TABLE purchase_bills IS 'Purchase invoices from suppliers with FIFO payment tracking';
COMMENT ON TABLE purchase_payments IS 'Payments made to suppliers';
COMMENT ON TABLE purchase_allocations IS 'FIFO allocation of payments to bills';
COMMENT ON TABLE agent_salaries IS 'Monthly salary records with expense breakdown';

COMMENT ON COLUMN suppliers.balance IS 'Credit owed TO supplier (positive = we owe them money)';
COMMENT ON COLUMN purchase_bills.balance IS 'Unpaid amount on this bill';
COMMENT ON COLUMN agent_salaries.net_salary IS 'Base salary + all expenses (company pays agent expenses)';
COMMENT ON COLUMN agent_salaries.total_expense IS 'Sum of travel + stay + food + other expenses';
