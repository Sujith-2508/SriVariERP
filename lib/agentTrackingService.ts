import { createClient } from '@supabase/supabase-js';
import { AgentStatus, Attendance, AgentLocation, AgentTrackingData, Agent } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Agent Tracking Service
 * Handles all agent tracking operations: status, attendance, and location tracking
 */

// ============================================
// AGENT STATUS OPERATIONS
// ============================================

/**
 * Get current status for a specific agent
 */
export async function getAgentStatus(agentId: string): Promise<AgentStatus | null> {
    const { data, error } = await supabase
        .from('agent_status')
        .select('*')
        .eq('agent_id', agentId)
        .single();

    if (error) {
        console.error('Error fetching agent status:', error);
        return null;
    }

    return data ? mapAgentStatus(data) : null;
}

/**
 * Get status for all agents
 */
export async function getAllAgentStatuses(): Promise<AgentStatus[]> {
    const { data, error } = await supabase
        .from('agent_status')
        .select('*')
        .order('last_active_at', { ascending: false });

    if (error) {
        console.error('Error fetching agent statuses:', error);
        return [];
    }

    return data.map(mapAgentStatus);
}

/**
 * Get combined tracking data for all agents
 */
export async function getAllAgentTrackingData(): Promise<AgentTrackingData[]> {
    // Get all agents
    const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('*')
        .order('name');

    if (agentsError) {
        console.error('Error fetching agents:', agentsError);
        return [];
    }

    // Get all statuses
    const statuses = await getAllAgentStatuses();
    const statusMap = new Map(statuses.map(s => [s.agentId, s]));

    // Get latest locations for all agents
    const locations = await getLatestLocations();
    const locationMap = new Map(locations.map(l => [l.agentId, l]));

    // Get today's attendance for all agents
    const today = new Date().toISOString().split('T')[0];
    const { data: attendanceData } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', today);

    const attendanceMap = new Map(
        (attendanceData || []).map(a => [a.agent_id, mapAttendance(a)])
    );

    // Combine all data
    return agents.map(agent => ({
        agent: mapAgent(agent),
        status: statusMap.get(agent.id),
        latestLocation: locationMap.get(agent.id),
        todayAttendance: attendanceMap.get(agent.id),
    }));
}

// ============================================
// LOCATION OPERATIONS
// ============================================

/**
 * Get latest location for each agent
 */
export async function getLatestLocations(): Promise<AgentLocation[]> {
    const { data, error } = await supabase
        .from('agent_locations')
        .select('*')
        .order('recorded_at', { ascending: false });

    if (error) {
        console.error('Error fetching latest locations:', error);
        return [];
    }

    // Get the latest location for each agent
    const latestByAgent = new Map<string, any>();
    data.forEach(location => {
        if (!latestByAgent.has(location.agent_id)) {
            latestByAgent.set(location.agent_id, location);
        }
    });

    return Array.from(latestByAgent.values()).map(mapAgentLocation);
}

/**
 * Get location history for a specific agent on a specific date
 */
export async function getAgentRoute(
    agentId: string,
    date: Date
): Promise<AgentLocation[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
        .from('agent_locations')
        .select('*')
        .eq('agent_id', agentId)
        .gte('recorded_at', startOfDay.toISOString())
        .lte('recorded_at', endOfDay.toISOString())
        .order('recorded_at', { ascending: true });

    if (error) {
        console.error('Error fetching agent route:', error);
        return [];
    }

    return data.map(mapAgentLocation);
}

// ============================================
// ATTENDANCE OPERATIONS
// ============================================

/**
 * Get attendance records for a specific agent and month
 */
export async function getAttendance(
    agentId: string,
    month: number,
    year: number
): Promise<Attendance[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('agent_id', agentId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

    if (error) {
        console.error('Error fetching attendance:', error);
        return [];
    }

    return data.map(mapAttendance);
}

/**
 * Get attendance summary for salary calculation
 */
export async function getAttendanceSummary(
    agentId: string,
    month: number,
    year: number
): Promise<{
    totalDays: number;
    presentDays: number;
    absentDays: number;
    halfDays: number;
    totalHours: number;
}> {
    const attendance = await getAttendance(agentId, month, year);

    const presentDays = attendance.filter(a => a.status === 'PRESENT').length;
    const absentDays = attendance.filter(a => a.status === 'ABSENT').length;
    const halfDays = attendance.filter(a => a.status === 'HALF_DAY').length;
    const totalHours = attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0);

    // Get total days in month
    const totalDays = new Date(year, month, 0).getDate();

    return {
        totalDays,
        presentDays,
        absentDays,
        halfDays,
        totalHours,
    };
}

/**
 * Calculate salary based on attendance
 */
export async function calculateSalary(
    agentId: string,
    baseSalary: number,
    month: number,
    year: number
): Promise<{
    baseSalary: number;
    presentDays: number;
    absentDays: number;
    halfDays: number;
    totalHours: number;
    deductions: number;
    netSalary: number;
}> {
    const summary = await getAttendanceSummary(agentId, month, year);

    // Calculate per-day salary
    const perDaySalary = baseSalary / summary.totalDays;

    // Calculate deductions
    // Full day absent = full day deduction
    // Half day = half day deduction
    const deductions = (summary.absentDays * perDaySalary) + (summary.halfDays * perDaySalary * 0.5);

    const netSalary = baseSalary - deductions;

    return {
        baseSalary,
        presentDays: summary.presentDays,
        absentDays: summary.absentDays,
        halfDays: summary.halfDays,
        totalHours: summary.totalHours,
        deductions,
        netSalary,
    };
}

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

/**
 * Subscribe to agent status changes
 */
export function subscribeToStatusUpdates(
    callback: (status: AgentStatus) => void
) {
    const subscription = supabase
        .channel('agent_status_changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'agent_status',
            },
            (payload) => {
                if (payload.new) {
                    callback(mapAgentStatus(payload.new));
                }
            }
        )
        .subscribe();

    return subscription;
}

/**
 * Subscribe to location updates
 */
export function subscribeToLocationUpdates(
    callback: (location: AgentLocation) => void
) {
    const subscription = supabase
        .channel('location_updates')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'agent_locations',
            },
            (payload) => {
                if (payload.new) {
                    callback(mapAgentLocation(payload.new));
                }
            }
        )
        .subscribe();

    return subscription;
}

/**
 * Subscribe to attendance updates
 */
export function subscribeToAttendanceUpdates(
    callback: (attendance: Attendance) => void
) {
    const subscription = supabase
        .channel('attendance_updates')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'attendance',
            },
            (payload) => {
                if (payload.new) {
                    callback(mapAttendance(payload.new));
                }
            }
        )
        .subscribe();

    return subscription;
}

// ============================================
// MAPPER FUNCTIONS (snake_case to camelCase)
// ============================================

function mapAgentStatus(data: any): AgentStatus {
    return {
        id: data.id,
        agentId: data.agent_id,
        isActive: data.is_active,
        lastActiveAt: new Date(data.last_active_at),
        currentLatitude: data.current_latitude,
        currentLongitude: data.current_longitude,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
    };
}

function mapAttendance(data: any): Attendance {
    return {
        id: data.id,
        agentId: data.agent_id,
        date: new Date(data.date),
        checkInTime: data.check_in_time ? new Date(data.check_in_time) : undefined,
        checkOutTime: data.check_out_time ? new Date(data.check_out_time) : undefined,
        totalHours: data.total_hours,
        status: data.status,
        notes: data.notes,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
    };
}

function mapAgentLocation(data: any): AgentLocation {
    return {
        id: data.id,
        agentId: data.agent_id,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        accuracy: data.accuracy,
        recordedAt: new Date(data.recorded_at),
        createdAt: new Date(data.created_at),
    };
}

function mapAgent(data: any): Agent {
    return {
        id: data.id,
        name: data.name,
        phone: data.phone,
        area: data.area,
        division: data.division,
        collectionTarget: data.collection_target,
        monthlySalary: data.monthly_salary,
        isActive: data.is_active,
        agentId: data.agent_id,
    };
}
