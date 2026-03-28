-- Migration 041: Company Expenses Table
-- Moves company expenses from localStorage (browser) to Supabase for persistence
-- Run this in the Supabase SQL Editor

-- ============================================
-- 1. TABLE: company_expenses
-- ============================================
CREATE TABLE IF NOT EXISTS company_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_type TEXT NOT NULL CHECK (expense_type IN ('GODOWN_RENT', 'ELECTRICITY_BILL', 'OFFICE_RENT', 'OTHER')),
    custom_name TEXT,                            -- Used when expense_type = 'OTHER'
    amount DECIMAL(12, 2) NOT NULL,
    date DATE NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_company_expenses_month_year ON company_expenses(month, year);
CREATE INDEX IF NOT EXISTS idx_company_expenses_date ON company_expenses(date);
CREATE INDEX IF NOT EXISTS idx_company_expenses_type ON company_expenses(expense_type);

-- ============================================
-- 3. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE company_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to company_expenses" ON company_expenses FOR ALL USING (true);

-- ============================================
-- 4. COMMENTS
-- ============================================
COMMENT ON TABLE company_expenses IS 'Company operational expenses (rent, electricity, etc.) - migrated from browser localStorage';
COMMENT ON COLUMN company_expenses.expense_type IS 'Category of expense: GODOWN_RENT, ELECTRICITY_BILL, OFFICE_RENT, OTHER';
COMMENT ON COLUMN company_expenses.custom_name IS 'Custom name when expense_type is OTHER';
COMMENT ON COLUMN company_expenses.month IS 'Month number (1-12) for easy filtering';
COMMENT ON COLUMN company_expenses.year IS 'Year for easy filtering';
