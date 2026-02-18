-- Migration: Improve Attendance and Status Tracking
-- Goal: Ensure attendance is marked every day the agent is active, even if they stay active across multiple days.
--       Also align column names with mobile app where possible or add missing ones.

-- 1. Add missing column to agent_status to track when they go offline
ALTER TABLE agent_status ADD COLUMN IF NOT EXISTS last_inactive_at TIMESTAMPTZ;

-- 2. Revise the attendance trigger to be more robust
-- This trigger will fire on every update to agent_status.
-- If is_active is TRUE, it ensures there is a PRESENT record for the CURRENT_DATE.
CREATE OR REPLACE FUNCTION mark_attendance_present()
RETURNS TRIGGER AS $$
BEGIN
    -- Only mark attendance if the agent is active
    IF NEW.is_active = TRUE THEN
        -- We use an UPSERT here. 
        -- If an attendance record for (agent_id, CURRENT_DATE) doesn't exist, create it.
        -- If it exists, ensure status is 'PRESENT'.
        INSERT INTO attendance (agent_id, date, status, check_in_time)
        VALUES (
            NEW.agent_id,
            CURRENT_DATE,
            'PRESENT',
            NOW()
        )
        ON CONFLICT (agent_id, date)
        DO UPDATE SET
            status = 'PRESENT', -- Force status to PRESENT if they are active
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Re-attach the trigger (just in case, though it should stay attached)
DROP TRIGGER IF EXISTS on_agent_active_mark_present ON agent_status;
CREATE TRIGGER on_agent_active_mark_present
    AFTER UPDATE ON agent_status
    FOR EACH ROW
    EXECUTE FUNCTION mark_attendance_present();

-- 4. Initial seed/fix: If any agent is CURRENTLY active, mark them present for today
-- This handles agents who are already online when this migration is applied.
INSERT INTO attendance (agent_id, date, status, check_in_time)
SELECT agent_id, CURRENT_DATE, 'PRESENT', NOW()
FROM agent_status
WHERE is_active = TRUE
ON CONFLICT (agent_id, date) DO UPDATE SET status = 'PRESENT';
