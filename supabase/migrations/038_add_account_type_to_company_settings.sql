-- Add account_type column if it doesn't exist
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'Current A/c';

-- Ensure it supports the required options
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_account_type') THEN
        ALTER TABLE company_settings ADD CONSTRAINT check_account_type CHECK (account_type IN ('Current A/c', 'Savings Account', 'OD Account'));
    END IF;
END $$;

-- Fix RLS Policies for company_settings
-- The table only had 'SELECT' access, which caused errors when trying to 'Save' (Insert/Update)
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- 1. Allow public read access (Select) - already exists but ensuring it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'Allow public read access') THEN
        CREATE POLICY "Allow public read access" ON company_settings FOR SELECT USING (true);
    END IF;
END $$;

-- 2. Allow insert access
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'Allow public insert access') THEN
        CREATE POLICY "Allow public insert access" ON company_settings FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- 3. Allow update access
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'Allow public update access') THEN
        CREATE POLICY "Allow public update access" ON company_settings FOR UPDATE USING (true) WITH CHECK (true);
    END IF;
END $$;
