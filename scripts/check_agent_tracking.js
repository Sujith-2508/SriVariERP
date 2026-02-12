// Script to check agent tracking data
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTracking() {
    console.log('=== Checking Agent Tracking Data ===\n');

    // Check agents
    const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('*')
        .order('name');

    if (agentsError) {
        console.error('Error fetching agents:', agentsError);
        return;
    }

    console.log(`Found ${agents.length} agents:`);
    agents.forEach(a => console.log(`  - ${a.name} (ID: ${a.id})`));
    console.log('');

    // Check agent_status
    const { data: statuses, error: statusError } = await supabase
        .from('agent_status')
        .select('*');

    console.log(`\n=== Agent Status Table (${statuses?.length || 0} records) ===`);
    if (statusError) {
        console.error('Error:', statusError);
    } else if (statuses.length === 0) {
        console.log('⚠️  No status records found!');
    } else {
        statuses.forEach(s => {
            const agent = agents.find(a => a.id === s.agent_id);
            console.log(`\n${agent?.name || 'Unknown'}:`);
            console.log(`  Active: ${s.is_active ? '✅ YES' : '❌ NO'}`);
            console.log(`  Last Active: ${s.last_active_at}`);
            console.log(`  Location: ${s.current_latitude}, ${s.current_longitude}`);
        });
    }

    // Check agent_locations
    const { data: locations, error: locError } = await supabase
        .from('agent_locations')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(10);

    console.log(`\n\n=== Agent Locations Table (showing latest 10 of ${locations?.length || 0}) ===`);
    if (locError) {
        console.error('Error:', locError);
    } else if (locations.length === 0) {
        console.log('⚠️  No location records found!');
    } else {
        locations.forEach(loc => {
            const agent = agents.find(a => a.id === loc.agent_id);
            console.log(`\n${agent?.name || 'Unknown'}:`);
            console.log(`  Lat/Lng: ${loc.latitude}, ${loc.longitude}`);
            console.log(`  Recorded: ${loc.recorded_at}`);
            console.log(`  Accuracy: ${loc.accuracy}m`);
        });
    }

    // Check attendance
    const today = new Date().toISOString().split('T')[0];
    const { data: attendance, error: attError } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', today);

    console.log(`\n\n=== Today's Attendance (${today}) ===`);
    if (attError) {
        console.error('Error:', attError);
    } else if (attendance.length === 0) {
        console.log('⚠️  No attendance records for today!');
    } else {
        attendance.forEach(att => {
            const agent = agents.find(a => a.id === att.agent_id);
            console.log(`\n${agent?.name || 'Unknown'}:`);
            console.log(`  Status: ${att.status}`);
            console.log(`  Check-in: ${att.check_in_time || 'Not checked in'}`);
            console.log(`  Check-out: ${att.check_out_time || 'Not checked out'}`);
            console.log(`  Hours: ${att.total_hours || 0}h`);
        });
    }

    console.log('\n\n=== Summary ===');
    console.log(`Total Agents: ${agents.length}`);
    console.log(`Agent Status Records: ${statuses?.length || 0}`);
    console.log(`Location Records: ${locations?.length || 0}`);
    console.log(`Today's Attendance: ${attendance?.length || 0}`);
}

checkTracking().catch(console.error);
