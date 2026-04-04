const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

console.log('--- Environment Check ---');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY (first 10 chars):', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 10), '...');

const googleKey = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
if (!googleKey) {
    console.error('Google Service Account Key MISSING');
} else {
    try {
        const parsed = JSON.parse(googleKey);
        console.log('Google Service Account Key: VALID JSON');
        console.log('Project ID:', parsed.project_id);
        console.log('Private Key present:', !!parsed.private_key);
        if (parsed.private_key) {
            console.log('Private Key length:', parsed.private_key.length);
            console.log('Private Key snippet:', parsed.private_key.substring(0, 30), '...');
        }
    } catch (e) {
        console.error('Google Service Account Key: INVALID JSON:', e.message);
        // Try to find the error position
        const match = e.message.match(/at position (\d+)/);
        if (match) {
            const pos = parseInt(match[1]);
            console.error('Error snippet at position', pos, ':', googleKey.substring(Math.max(0, pos - 20), Math.min(googleKey.length, pos + 20)));
        }
    }
}

console.log('NEXT_PUBLIC_GOOGLE_SHEET_CSV_URL:', process.env.NEXT_PUBLIC_GOOGLE_SHEET_CSV_URL);
console.log('--- End of Check ---');
