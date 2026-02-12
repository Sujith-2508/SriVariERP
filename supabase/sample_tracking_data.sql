-- Sample Data for Agent Tracking Tables
-- This will populate the tables with realistic test data
-- Run this in Supabase SQL Editor AFTER running 017_agent_tracking_tables.sql

-- ============================================
-- STEP 1: Get your agent IDs
-- ============================================
-- First, let's see what agents you have:
-- SELECT id, name FROM agents;

-- ============================================
-- STEP 2: Insert sample agent status
-- Replace the UUIDs below with actual agent IDs from your agents table
-- ============================================

-- Example for 3 agents - REPLACE THESE UUIDs WITH YOUR ACTUAL AGENT IDs
DO $$
DECLARE
    agent_ids UUID[];
    agent_id UUID;
    i INT;
BEGIN
    -- Get all agent IDs
    SELECT ARRAY_AGG(id) INTO agent_ids FROM agents LIMIT 5;
    
    -- Insert status for each agent
    FOR i IN 1..LEAST(array_length(agent_ids, 1), 5) LOOP
        agent_id := agent_ids[i];
        
        -- First 2 agents are active, rest are inactive
        IF i <= 2 THEN
            INSERT INTO agent_status (agent_id, is_active, last_active_at, current_latitude, current_longitude)
            VALUES (
                agent_id,
                true,
                NOW() - (RANDOM() * INTERVAL '30 minutes'),
                17.385044 + (RANDOM() * 0.1 - 0.05),  -- Hyderabad area
                78.486671 + (RANDOM() * 0.1 - 0.05)
            )
            ON CONFLICT (agent_id) DO UPDATE SET
                is_active = EXCLUDED.is_active,
                last_active_at = EXCLUDED.last_active_at,
                current_latitude = EXCLUDED.current_latitude,
                current_longitude = EXCLUDED.current_longitude;
        ELSE
            INSERT INTO agent_status (agent_id, is_active, last_active_at, current_latitude, current_longitude)
            VALUES (
                agent_id,
                false,
                NOW() - (RANDOM() * INTERVAL '2 hours'),
                17.385044 + (RANDOM() * 0.1 - 0.05),
                78.486671 + (RANDOM() * 0.1 - 0.05)
            )
            ON CONFLICT (agent_id) DO UPDATE SET
                is_active = EXCLUDED.is_active,
                last_active_at = EXCLUDED.last_active_at,
                current_latitude = EXCLUDED.current_latitude,
                current_longitude = EXCLUDED.current_longitude;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- STEP 3: Insert today's attendance
-- ============================================
DO $$
DECLARE
    agent_ids UUID[];
    agent_id UUID;
    i INT;
BEGIN
    SELECT ARRAY_AGG(id) INTO agent_ids FROM agents LIMIT 5;
    
    FOR i IN 1..LEAST(array_length(agent_ids, 1), 5) LOOP
        agent_id := agent_ids[i];
        
        -- Different attendance patterns
        IF i = 1 THEN
            -- Full day present
            INSERT INTO attendance (agent_id, date, check_in_time, check_out_time)
            VALUES (
                agent_id,
                CURRENT_DATE,
                CURRENT_DATE + TIME '09:00:00',
                CURRENT_DATE + TIME '18:00:00'
            )
            ON CONFLICT (agent_id, date) DO UPDATE SET
                check_in_time = EXCLUDED.check_in_time,
                check_out_time = EXCLUDED.check_out_time;
        ELSIF i = 2 THEN
            -- Currently working (no check-out yet)
            INSERT INTO attendance (agent_id, date, check_in_time, check_out_time)
            VALUES (
                agent_id,
                CURRENT_DATE,
                CURRENT_DATE + TIME '09:30:00',
                NULL
            )
            ON CONFLICT (agent_id, date) DO UPDATE SET
                check_in_time = EXCLUDED.check_in_time;
        ELSIF i = 3 THEN
            -- Half day
            INSERT INTO attendance (agent_id, date, check_in_time, check_out_time)
            VALUES (
                agent_id,
                CURRENT_DATE,
                CURRENT_DATE + TIME '09:00:00',
                CURRENT_DATE + TIME '14:00:00'
            )
            ON CONFLICT (agent_id, date) DO UPDATE SET
                check_in_time = EXCLUDED.check_in_time,
                check_out_time = EXCLUDED.check_out_time;
        ELSIF i = 4 THEN
            -- Absent
            INSERT INTO attendance (agent_id, date, status)
            VALUES (agent_id, CURRENT_DATE, 'ABSENT')
            ON CONFLICT (agent_id, date) DO UPDATE SET
                status = EXCLUDED.status;
        ELSE
            -- Leave
            INSERT INTO attendance (agent_id, date, status, notes)
            VALUES (agent_id, CURRENT_DATE, 'LEAVE', 'Sick leave')
            ON CONFLICT (agent_id, date) DO UPDATE SET
                status = EXCLUDED.status,
                notes = EXCLUDED.notes;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- STEP 4: Insert previous month attendance (for salary calculation)
-- ============================================
DO $$
DECLARE
    agent_ids UUID[];
    agent_id UUID;
    day_date DATE;
    day_num INT;
    work_days INT;
BEGIN
    SELECT ARRAY_AGG(id) INTO agent_ids FROM agents LIMIT 3;
    
    -- Only for first 3 agents
    FOR i IN 1..LEAST(array_length(agent_ids, 1), 3) LOOP
        agent_id := agent_ids[i];
        work_days := 0;
        
        -- Generate attendance for last month
        FOR day_num IN 1..28 LOOP
            day_date := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') + (day_num - 1);
            
            -- Skip weekends
            IF EXTRACT(DOW FROM day_date) NOT IN (0, 6) THEN
                work_days := work_days + 1;
                
                IF work_days <= 18 THEN
                    -- Present days (18 days)
                    INSERT INTO attendance (agent_id, date, check_in_time, check_out_time)
                    VALUES (
                        agent_id,
                        day_date,
                        day_date + TIME '09:00:00' + (RANDOM() * INTERVAL '30 minutes'),
                        day_date + TIME '18:00:00' + (RANDOM() * INTERVAL '30 minutes')
                    )
                    ON CONFLICT (agent_id, date) DO NOTHING;
                ELSIF work_days <= 19 THEN
                    -- Half day
                    INSERT INTO attendance (agent_id, date, check_in_time, check_out_time)
                    VALUES (
                        agent_id,
                        day_date,
                        day_date + TIME '09:00:00',
                        day_date + TIME '13:00:00'
                    )
                    ON CONFLICT (agent_id, date) DO NOTHING;
                ELSIF work_days <= 20 THEN
                    -- Absent
                    INSERT INTO attendance (agent_id, date, status)
                    VALUES (agent_id, day_date, 'ABSENT')
                    ON CONFLICT (agent_id, date) DO NOTHING;
                ELSE
                    -- Leave
                    INSERT INTO attendance (agent_id, date, status)
                    VALUES (agent_id, day_date, 'LEAVE')
                    ON CONFLICT (agent_id, date) DO NOTHING;
                END IF;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- ============================================
-- STEP 5: Insert GPS location history (route for today)
-- ============================================
DO $$
DECLARE
    agent_ids UUID[];
    agent_id UUID;
    start_time TIMESTAMPTZ;
    current_time TIMESTAMPTZ;
    lat DECIMAL(10, 8);
    lng DECIMAL(11, 8);
    i INT;
    j INT;
BEGIN
    -- Get first 2 active agents
    SELECT ARRAY_AGG(id) INTO agent_ids FROM agents LIMIT 2;
    
    FOR i IN 1..LEAST(array_length(agent_ids, 1), 2) LOOP
        agent_id := agent_ids[i];
        start_time := CURRENT_DATE + TIME '09:00:00';
        
        -- Starting location (Hyderabad)
        lat := 17.385044;
        lng := 78.486671;
        
        -- Create location points every 5 minutes for 9 hours (108 points)
        FOR j IN 0..108 LOOP
            current_time := start_time + (j * INTERVAL '5 minutes');
            
            -- Simulate movement (random walk)
            lat := lat + (RANDOM() * 0.002 - 0.001);
            lng := lng + (RANDOM() * 0.002 - 0.001);
            
            INSERT INTO agent_locations (agent_id, latitude, longitude, accuracy, recorded_at)
            VALUES (
                agent_id,
                lat,
                lng,
                5.0 + RANDOM() * 15,  -- Accuracy between 5-20 meters
                current_time
            );
        END LOOP;
    END LOOP;
END $$;

-- ============================================
-- STEP 6: Verify the data
-- ============================================
-- Check agent status
SELECT 
    a.name,
    ast.is_active,
    ast.last_active_at,
    ast.current_latitude,
    ast.current_longitude
FROM agent_status ast
JOIN agents a ON a.id = ast.agent_id
ORDER BY ast.is_active DESC, ast.last_active_at DESC;

-- Check today's attendance
SELECT 
    a.name,
    att.date,
    att.check_in_time,
    att.check_out_time,
    att.total_hours,
    att.status
FROM attendance att
JOIN agents a ON a.id = att.agent_id
WHERE att.date = CURRENT_DATE
ORDER BY a.name;

-- Check location count
SELECT 
    a.name,
    COUNT(al.id) as location_count,
    MIN(al.recorded_at) as first_location,
    MAX(al.recorded_at) as last_location
FROM agent_locations al
JOIN agents a ON a.id = al.agent_id
WHERE al.recorded_at >= CURRENT_DATE
GROUP BY a.name
ORDER BY location_count DESC;
