-- Optimization: Create a view for latest agent locations
-- This avoids fetching the entire location history in the desktop app

CREATE OR REPLACE VIEW latest_agent_locations AS
SELECT DISTINCT ON (agent_id)
    id,
    agent_id,
    latitude,
    longitude,
    accuracy,
    address,
    recorded_at,
    created_at
FROM agent_locations
ORDER BY agent_id, recorded_at DESC;

-- Grant access to the view
GRANT SELECT ON latest_agent_locations TO anon, authenticated;

-- Ensure all agents have a status record (even those added recently)
INSERT INTO agent_status (agent_id, is_active)
SELECT id, false FROM agents
ON CONFLICT (agent_id) DO NOTHING;
