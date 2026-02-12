-- Insert test location data for agent Sujith
-- This will make him appear on the Live Tracking map

-- First, get Sujith's agent ID
-- Replace 'Sujith' with the exact name if different

-- Insert or update agent_status to mark as active
INSERT INTO agent_status (agent_id, is_active, last_active_at, current_latitude, current_longitude)
SELECT 
    id,
    true,
    NOW(),
    17.3850,  -- Hyderabad coordinates (example)
    78.4867
FROM agents
WHERE name = 'Sujith'
ON CONFLICT (agent_id) 
DO UPDATE SET
    is_active = true,
    last_active_at = NOW(),
    current_latitude = 17.3850,
    current_longitude = 78.4867,
    updated_at = NOW();

-- Insert location breadcrumb in agent_locations
INSERT INTO agent_locations (agent_id, latitude, longitude, accuracy, recorded_at)
SELECT 
    id,
    17.3850,  -- Hyderabad coordinates
    78.4867,
    10.0,     -- 10 meters accuracy
    NOW()
FROM agents
WHERE name = 'Sujith';

-- Insert today's attendance check-in
INSERT INTO attendance (agent_id, date, check_in_time, status)
SELECT 
    id,
    CURRENT_DATE,
    NOW(),
    'PRESENT'
FROM agents
WHERE name = 'Sujith'
ON CONFLICT (agent_id, date) 
DO UPDATE SET
    check_in_time = NOW(),
    status = 'PRESENT',
    updated_at = NOW();

-- Verify the data was inserted
SELECT 
    a.name,
    a.agent_id,
    ast.is_active,
    ast.last_active_at,
    ast.current_latitude,
    ast.current_longitude,
    COUNT(al.id) as location_count
FROM agents a
LEFT JOIN agent_status ast ON a.id = ast.agent_id
LEFT JOIN agent_locations al ON a.id = al.agent_id
WHERE a.name = 'Sujith'
GROUP BY a.id, a.name, a.agent_id, ast.is_active, ast.last_active_at, ast.current_latitude, ast.current_longitude;
