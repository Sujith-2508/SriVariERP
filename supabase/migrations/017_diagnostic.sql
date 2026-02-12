-- DIAGNOSTIC QUERY: Run this FIRST to check if tables already exist
-- Copy and run this in Supabase SQL Editor BEFORE running the main migration

-- Check if agent tracking tables already exist
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('agent_status', 'attendance', 'agent_locations')
ORDER BY table_name, ordinal_position;

-- If you see results, it means tables already exist!
-- In that case, you need to DROP them first:

-- DROP TABLE IF EXISTS agent_locations CASCADE;
-- DROP TABLE IF EXISTS attendance CASCADE;
-- DROP TABLE IF EXISTS agent_status CASCADE;

-- Then run the main migration: 017_agent_tracking_tables.sql
