const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLocations() {
    console.log('Checking latest agent locations...');
    const { data, error } = await supabase
        .from('agent_locations')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data.length === 0) {
        console.log('No location data found.');
    } else {
        console.log('Latest 5 locations:');
        data.forEach(loc => {
            console.log(`Agent ID: ${loc.agent_id}, Lat: ${loc.latitude}, Lng: ${loc.longitude}, Recorded At: ${loc.recorded_at}`);
        });
    }

    console.log('\nChecking agent statuses...');
    const { data: statusData, error: statusError } = await supabase
        .from('agent_status')
        .select('*')
        .order('last_active_at', { ascending: false });

    if (statusError) {
        console.error('Error:', statusError);
        return;
    }

    if (statusData.length === 0) {
        console.log('No status data found.');
    } else {
        console.log('Agent Statuses:');
        statusData.forEach(status => {
            console.log(`Agent ID: ${status.agent_id}, Active: ${status.is_active}, Last Active: ${status.last_active_at}`);
        });
    }
}

checkLocations();
