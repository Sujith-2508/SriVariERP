import fs from 'fs';
import crypto from 'crypto';

// Authenticate using .env.local
const envFile = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const SPREADSHEET_ID = '1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0';
const SERVICE_ACCOUNT_KEY = env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
const SRC_SHEET_NAME = 'refined suppliers';
const OUTPUT_FILE = 'public/migration/suppliers.json';

if (!SERVICE_ACCOUNT_KEY) {
    console.error('SERVICE_ACCOUNT_KEY not found in .env.local');
    process.exit(1);
}

const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);

async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    }));
    const signInput = `${header}.${claims}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signInput), credentials.private_key);
    const jwt = `${signInput}.${base64urlFromBuffer(signature)}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const data = await response.json();
    return data.access_token;
}

function base64url(str: string) { return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64urlFromBuffer(buffer: Buffer) { return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

async function sheetsRequest(path: string, method = 'GET', body: any = null, token: string) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`;
    const response = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : null,
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Sheets API error: ${err}`);
    }
    return response.json();
}

async function main() {
    console.log('Fetching refined suppliers from Google Sheets...');
    const token = await getAccessToken();

    // Fetch data from 'refined suppliers'
    const dataResponse = await sheetsRequest(`/values/${SRC_SHEET_NAME}!A:E`, 'GET', null, token);
    const rows = dataResponse.values || [];
    if (rows.length <= 1) {
        console.log('No data found in source sheet.');
        return;
    }

    // Map rows to SupplierData format
    // Header: Name, Address, GST Number, Phone, Period
    const suppliers = rows.slice(1).map((row: any) => {
        const name = (row[0] || '').trim();
        const address = (row[1] || '').trim();
        const gst = (row[2] || '').trim();
        const phone = (row[3] || '').trim();

        return {
            id: crypto.randomUUID(),
            name,
            address,
            city: '', // We can try to extract city from address if needed, but for now empty
            gstNumber: gst,
            phone,
            balance: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    });

    console.log(`Prepared ${suppliers.length} suppliers for upload.`);

    // Write to suppliers.json
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(suppliers, null, 2));
    console.log(`Successfully wrote to ${OUTPUT_FILE}`);
}

main();
