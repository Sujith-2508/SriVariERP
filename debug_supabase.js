const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAll() {
    console.log('--- Supabase Diagnostic ---');
    console.log('Checking agents...');
    const { data: agents, error: agentsErr } = await supabase.from('agents').select('*').limit(3);
    if (agentsErr) console.error('Agents Error:', agentsErr);
    else console.log('Agents count:', agents.length);

    console.log('\nChecking dealers...');
    const { data: dealers, error: dealersErr } = await supabase.from('dealers').select('*').limit(3);
    if (dealersErr) console.error('Dealers Error:', dealersErr);
    else console.log('Dealers count:', dealers.length);

    console.log('\nChecking products fallback from Google Sheets CSV (HTTP)...');
    try {
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        const sheetUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEET_CSV_URL;
        if (sheetUrl) {
            const resp = await (await fetch(sheetUrl)).text();
            console.log('CSV Status: OK, length:', resp.length);
        } else {
            console.log('CSV URL not set');
        }
    } catch (e) {
        console.error('CSV Error:', e.message);
    }
}

checkAll();
