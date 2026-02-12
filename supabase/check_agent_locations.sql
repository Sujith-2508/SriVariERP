-- Query to check actual agent location data in the database

-- Get all agent locations with agent details
SELECT 
    a.name as agent_name,
    a.agent_id,
    al.latitude,
    al.longitude,
    al.accuracy,
    al.recorded_at,
    al.created_at,
    -- Calculate how long ago this was recorded
    EXTRACT(EPOCH FROM (NOW() - al.recorded_at)) / 60 as minutes_ago
FROM agent_locations al
JOIN agents a ON a.id = al.agent_id
ORDER BY al.recorded_at DESC
LIMIT 50;

-- Get the latest location for each agent
SELECT 
    a.name as agent_name,
    a.agent_id,
    al.latitude,
    al.longitude,
    al.accuracy,
    al.recorded_at,
    EXTRACT(EPOCH FROM (NOW() - al.recorded_at)) / 60 as minutes_ago
FROM agents a
LEFT JOIN LATERAL (
    SELECT *
    FROM agent_locations
    WHERE agent_id = a.id
    ORDER BY recorded_at DESC
    LIMIT 1
) al ON true
WHERE al.id IS NOT NULL
ORDER BY al.recorded_at DESC;

-- Get agent status with current location
SELECT 
    a.name as agent_name,
    a.agent_id,
    ast.is_active,
    ast.current_latitude,
    ast.current_longitude,
    ast.last_active_at,
    EXTRACT(EPOCH FROM (NOW() - ast.last_active_at)) / 60 as minutes_since_active
FROM agents a
LEFT JOIN agent_status ast ON a.id = ast.agent_id
ORDER BY ast.last_active_at DESC NULLS LAST;

-- Count total locations per agent
SELECT 
    a.name as agent_name,
    COUNT(al.id) as total_locations,
    MIN(al.recorded_at) as first_location,
    MAX(al.recorded_at) as latest_location
FROM agents a
LEFT JOIN agent_locations al ON a.id = al.agent_id
GROUP BY a.id, a.name
ORDER BY total_locations DESC;
