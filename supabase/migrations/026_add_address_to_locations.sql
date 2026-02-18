-- Migration: Add address columns to tracking tables
-- Goal: Store reverse geocoded addresses for agent location history and current status

-- Add to history table
ALTER TABLE agent_locations ADD COLUMN IF NOT EXISTS address TEXT;
COMMENT ON COLUMN agent_locations.address IS 'Reverse geocoded address for this coordinate';

-- Add to status table
ALTER TABLE agent_status ADD COLUMN IF NOT EXISTS current_address TEXT;
COMMENT ON COLUMN agent_status.current_address IS 'Currently reverse geocoded address';
