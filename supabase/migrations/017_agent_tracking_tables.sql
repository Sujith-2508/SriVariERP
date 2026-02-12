-- Migration: Agent Tracking Tables - COMPLETE RECREATION
-- This will DROP existing tables and recreate them with the correct schema
-- WARNING: This will delete any existing data in these tables!

-- ============================================
-- STEP 1: Drop existing tables (if they exist)
-- ============================================
DROP TABLE IF EXISTS agent_locations CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS agent_status CASCADE;

-- ============================================
-- STEP 2: Create agent_status table
-- ============================================
CREATE TABLE agent_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT FALSE,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id)
);

-- ============================================
-- STEP 3: Create attendance table
-- ============================================
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    total_hours DECIMAL(5, 2),
    status TEXT CHECK (status IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, date)
);

-- ============================================
-- STEP 4: Create agent_locations table
-- ============================================
CREATE TABLE agent_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(8, 2),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STEP 5: Create indexes
-- ============================================
CREATE INDEX idx_agent_status_agent_id ON agent_status(agent_id);
CREATE INDEX idx_agent_status_is_active ON agent_status(is_active);

CREATE INDEX idx_attendance_agent_id ON attendance(agent_id);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_agent_date ON attendance(agent_id, date);

CREATE INDEX idx_agent_locations_agent_id ON agent_locations(agent_id);
CREATE INDEX idx_agent_locations_recorded_at ON agent_locations(recorded_at);
CREATE INDEX idx_agent_locations_agent_date ON agent_locations(agent_id, recorded_at);

-- ============================================
-- STEP 6: Create attendance hours calculation function and trigger
-- ============================================
CREATE OR REPLACE FUNCTION calculate_attendance_hours()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
        NEW.total_hours = EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0;
        
        IF NEW.total_hours >= 8 THEN
            NEW.status = 'PRESENT';
        ELSIF NEW.total_hours >= 4 THEN
            NEW.status = 'HALF_DAY';
        ELSE
            NEW.status = 'ABSENT';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_hours_trigger BEFORE INSERT OR UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION calculate_attendance_hours();

-- ============================================
-- STEP 7: Enable Row Level Security
-- ============================================
ALTER TABLE agent_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to agent_status" ON agent_status FOR ALL USING (true);
CREATE POLICY "Allow all access to attendance" ON attendance FOR ALL USING (true);
CREATE POLICY "Allow all access to agent_locations" ON agent_locations FOR ALL USING (true);

-- ============================================
-- STEP 8: Add comments
-- ============================================
COMMENT ON TABLE agent_status IS 'Real-time active/inactive status for each agent with current location';
COMMENT ON TABLE attendance IS 'Daily attendance records with check-in/check-out times and auto-calculated hours';
COMMENT ON TABLE agent_locations IS 'GPS location breadcrumb trail (every 5 minutes while active)';

COMMENT ON COLUMN agent_status.is_active IS 'Whether agent is currently active (on duty)';
COMMENT ON COLUMN agent_status.last_active_at IS 'Last time agent was active or changed status';
COMMENT ON COLUMN agent_status.current_latitude IS 'Latest GPS latitude';
COMMENT ON COLUMN agent_status.current_longitude IS 'Latest GPS longitude';

COMMENT ON COLUMN attendance.total_hours IS 'Auto-calculated hours worked (check_out_time - check_in_time)';
COMMENT ON COLUMN attendance.status IS 'PRESENT (>=8h), HALF_DAY (>=4h), ABSENT (<4h), or LEAVE';

COMMENT ON COLUMN agent_locations.accuracy IS 'GPS accuracy in meters';
COMMENT ON COLUMN agent_locations.recorded_at IS 'When this GPS coordinate was recorded';
