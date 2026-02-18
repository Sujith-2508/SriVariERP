-- Migration: Fix Missing Columns for Location and Status
-- This aligns the database schema with the mobile app's repository logic.

-- 1. Add missing columns to agent_status
ALTER TABLE agent_status ADD COLUMN IF NOT EXISTS current_address TEXT;
ALTER TABLE agent_status ADD COLUMN IF NOT EXISTS last_inactive_at TIMESTAMPTZ;

-- 2. Add missing column to agent_locations (history table)
ALTER TABLE agent_locations ADD COLUMN IF NOT EXISTS address TEXT;

-- 3. Force Supabase to refresh its schema cache
NOTIFY pgrst, 'reload schema';

-- 4. Initial check: Ensure all agents have a status record
INSERT INTO agent_status (agent_id, is_active)
SELECT id, false FROM agents
ON CONFLICT (agent_id) DO NOTHING;
