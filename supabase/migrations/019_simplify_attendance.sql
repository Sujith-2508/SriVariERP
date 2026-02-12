-- Migration: Simplify Attendance Logic
-- Goal: Mark agent as 'PRESENT' immediately when they become active.
--       Disable/Relax the strict hour-based status calculation.

-- 1. Create a trigger function to mark attendance as PRESENT when is_active becomes TRUE
CREATE OR REPLACE FUNCTION mark_attendance_present()
RETURNS TRIGGER AS $$
BEGIN
    -- Only run when is_active changes from FALSE/NULL to TRUE
    IF NEW.is_active = TRUE AND (OLD.is_active = FALSE OR OLD.is_active IS NULL) THEN
        -- Insert or Update attendance for today
        -- We explicitly set status to 'PRESENT'
        -- We allow check_in_time to be set to NOW() if it's a new record
        INSERT INTO attendance (agent_id, date, status, check_in_time)
        VALUES (
            NEW.agent_id,
            CURRENT_DATE,
            'PRESENT',
            NOW()
        )
        ON CONFLICT (agent_id, date)
        DO UPDATE SET
            status = 'PRESENT', -- Force status to PRESENT (as per user request: active = present)
            updated_at = NOW();
            -- We do NOT overwrite check_in_time if it exists, to preserve the first check-in
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach the trigger to agent_status
DROP TRIGGER IF EXISTS on_agent_active_mark_present ON agent_status;
CREATE TRIGGER on_agent_active_mark_present
    AFTER UPDATE ON agent_status
    FOR EACH ROW
    EXECUTE FUNCTION mark_attendance_present();

-- 3. Update the existing calculate_attendance_hours function to NOT overwrite 'PRESENT' status
--    or simply relax it.
CREATE OR REPLACE FUNCTION calculate_attendance_hours()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
        NEW.total_hours = EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0;
        
        -- ORIGINAL LOGIC:
        -- IF NEW.total_hours >= 8 THEN NEW.status = 'PRESENT'; ...
        
        -- NEW LOGIC:
        -- Only set status if it is currently NULL. 
        -- If it's already 'PRESENT' (from the active trigger), we keep it.
        -- If user manually marks it, we keep it.
        IF NEW.status IS NULL THEN
             IF NEW.total_hours >= 8 THEN
                NEW.status = 'PRESENT';
            ELSIF NEW.total_hours >= 4 THEN
                NEW.status = 'HALF_DAY';
            ELSE
                NEW.status = 'ABSENT';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
