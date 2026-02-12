// Script to insert location data for agent Sujith
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qimbzfensppfzgokrkuz.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_CcI_L-sx3NL5RW74vhpMeQ_c2MMslJR';

const supabase = createClient(supabaseUrl, supabaseKey);

async function insertAgentLocation() {
    console.log('🔍 Finding agent Sujith...\n');

    // Get Sujith's agent record
    const { data: agents, error: agentError } = await supabase
        .from('agents')
        .select('*')
        .eq('name', 'Sujith')
        .single();

    if (agentError || !agents) {
        console.error('❌ Agent Sujith not found:', agentError?.message);
        console.log('\n💡 Available agents:');
        const { data: allAgents } = await supabase.from('agents').select('name');
        allAgents?.forEach(a => console.log(`   - ${a.name}`));
        process.exit(1);
    }

    console.log(`✅ Found agent: ${agents.name} (ID: ${agents.id})\n`);

    const agentId = agents.id;
    const latitude = 17.3850;  // Hyderabad coordinates
    const longitude = 78.4867;

    // Step 1: Insert/Update agent_status
    console.log('📍 Updating agent status...');
    const { error: statusError } = await supabase
        .from('agent_status')
        .upsert({
            agent_id: agentId,
            is_active: true,
            last_active_at: new Date().toISOString(),
            current_latitude: latitude,
            current_longitude: longitude,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'agent_id'
        });

    if (statusError) {
        console.error('❌ Error updating status:', statusError.message);
    } else {
        console.log('✅ Agent status updated - marked as ACTIVE\n');
    }

    // Step 2: Insert location in agent_locations
    console.log('📍 Inserting location breadcrumb...');
    const { error: locationError } = await supabase
        .from('agent_locations')
        .insert({
            agent_id: agentId,
            latitude: latitude,
            longitude: longitude,
            accuracy: 10.0,
            recorded_at: new Date().toISOString()
        });

    if (locationError) {
        console.error('❌ Error inserting location:', locationError.message);
    } else {
        console.log('✅ Location inserted successfully\n');
    }

    // Step 3: Insert/Update today's attendance
    console.log('📅 Recording attendance...');
    const today = new Date().toISOString().split('T')[0];
    const { error: attendanceError } = await supabase
        .from('attendance')
        .upsert({
            agent_id: agentId,
            date: today,
            check_in_time: new Date().toISOString(),
            status: 'PRESENT',
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'agent_id,date'
        });

    if (attendanceError) {
        console.error('❌ Error recording attendance:', attendanceError.message);
    } else {
        console.log('✅ Attendance recorded - checked in\n');
    }

    // Verify the data
    console.log('🔍 Verifying data...\n');

    const { data: status } = await supabase
        .from('agent_status')
        .select('*')
        .eq('agent_id', agentId)
        .single();

    const { data: locations } = await supabase
        .from('agent_locations')
        .select('*')
        .eq('agent_id', agentId)
        .order('recorded_at', { ascending: false })
        .limit(1);

    const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('agent_id', agentId)
        .eq('date', today)
        .single();

    console.log('═══════════════════════════════════════');
    console.log('📊 VERIFICATION RESULTS');
    console.log('═══════════════════════════════════════');
    console.log(`Agent: ${agents.name}`);
    console.log(`Status: ${status?.is_active ? '🟢 ACTIVE' : '⚫ INACTIVE'}`);
    console.log(`Location: ${status?.current_latitude}, ${status?.current_longitude}`);
    console.log(`Last Active: ${status?.last_active_at}`);
    console.log(`Location Records: ${locations?.length || 0}`);
    console.log(`Attendance: ${attendance?.status || 'Not recorded'}`);
    console.log('═══════════════════════════════════════\n');

    console.log('✅ SUCCESS! Agent Sujith should now appear on the Live Tracking map.');
    console.log('\n📱 Next steps:');
    console.log('   1. Go to Collection Agents page');
    console.log('   2. Click "Live Tracking" tab');
    console.log('   3. You should see Sujith with a green marker on the map\n');
}

insertAgentLocation().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
