-- Migration: Add opening_balance column to dealers table
-- Run this in Supabase SQL Editor

ALTER TABLE dealers ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(12, 2) DEFAULT 0;

-- Update existing balance logic - existing dealers with current balance might need an OB check
-- But usually OB is just a static reference field we added.
