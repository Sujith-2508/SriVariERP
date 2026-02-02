-- Migration: Add collection_target and division columns to agents table
-- Run this in Supabase SQL Editor

ALTER TABLE agents ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS collection_target DECIMAL(12, 2) DEFAULT 100000;

-- Update existing agents with default values if needed
UPDATE agents SET division = area WHERE division IS NULL;
UPDATE agents SET collection_target = 100000 WHERE collection_target IS NULL;
