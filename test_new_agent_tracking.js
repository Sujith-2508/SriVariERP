const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const NEW_AGENT_ID = '8d233631-7555-4368-a98b-256ed3456ec7'; // New-Agent
const CHENNAI_LAT = 13.0827;
const CHENNAI_LNG = 80.2707;

async function testTracking() {
    console.log('--- Manually testing tracking for New-Agent (Chennai) ---');

    // 1. Insert into agent_locations
    const recordedAt = new Date().toISOString();
    const { error: locError } = await supabase
        .from('agent_locations')
        .insert({
            agent_id: NEW_AGENT_ID,
            latitude: CHENNAI_LAT,
            longitude: CHENNAI_LNG,
            accuracy: 10,
            address: 'Test Location, Chennai Central',
            recorded_at: recordedAt
        });

    if (locError) {
        console.error('Error inserting location:', locError);
    } else {
        console.log('✅ Inserted Chennai location into agent_locations');
    }

    // 2. Update agent_status
    const { error: statusError } = await supabase
        .from('agent_status')
        .upsert({
            agent_id: NEW_AGENT_ID,
            is_active: true,
            current_latitude: CHENNAI_LAT,
            current_longitude: CHENNAI_LNG,
            current_address: 'Test Location, Chennai Central',
            last_active_at: recordedAt,
            updated_at: recordedAt
        });

    if (statusError) {
        console.error('Error updating status:', statusError);
    } else {
        console.log('✅ Updated agent_status for New-Agent');
    }
}

testTracking();
