-- Clear Agent Tracking Data
-- Use this to remove test data (like the Hyderabad location)

-- 1. Clear location history
TRUNCATE TABLE agent_locations;

-- 2. Reset agent status (optional, but good for a clean slate)
--    This sets all agents to inactive and removes their current location
UPDATE agent_status
SET 
    is_active = false,
    current_latitude = NULL,
    current_longitude = NULL,
    last_active_at = NOW(),
    battery_level = NULL;

-- 3. Clear attendance (Optional - uncomment if you want to clear attendance too)
-- TRUNCATE TABLE attendance;
