import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Minimal implementation of the Sheets Writer logic for standalone execution
const envFile = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const SPREADSHEET_ID = '1ksFhdJK6-sQxVBIkqqJdRKPhm--_SfzpJeuC2GHR2y0';
const SERVICE_ACCOUNT_KEY = env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
const SHEET_NAME = 'Updated Stock Items';

if (!SERVICE_ACCOUNT_KEY) {
    console.error('SERVICE_ACCOUNT_KEY not found in .env.local');
    process.exit(1);
}

const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);

// JWT Auth logic
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

function base64url(str: string) {
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlFromBuffer(buffer: Buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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

const KNOWN_CATEGORIES = new Set([
    'cookwares', 'fans', 'grinder', 'heater', 'hotbox',
    'maharaja', 'mixie', 'non sticks', 'raja', 'handle', 'raja cookwares',
    'stainless steel', 'table top grinders', 'vaccum flask',
    'sales return', 'scrabs', 'castirons', 'butterfly induction', 'stove'
]);

async function main() {
    console.log('Starting bulk import...');
    const token = await getAccessToken();
    const productsFile = fs.readFileSync('bulk_products.txt', 'utf-8');
    const lines = productsFile.split('\n');

    let currentCategory = 'General';
    const rows = [];

    // Add header row
    rows.push(['Product Name', '', '', 'Unit', 'Cost Price', 'Selling Price', 'GST%', 'Stock', 'Category']);

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const lower = line.toLowerCase();

        // Skip some meta lines if they appear
        if (lower.includes('list of stock items') || lower.includes('1-apr-19 to')) continue;

        if (KNOWN_CATEGORIES.has(lower)) {
            currentCategory = line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
            console.log(`Setting category to: ${currentCategory}`);
            continue;
        }

        // Product row: [Name, B, C, Unit, Cost, Price, GST, Stock, Category]
        rows.push([line, '', '', 'nos', '0', '0', '0', '0', currentCategory]);
    }

    console.log(`Prepared ${rows.length - 1} products. Uploading to "${SHEET_NAME}"...`);

    // Ensure tab exists (simplified for script)
    try {
        await sheetsRequest(':batchUpdate', 'POST', {
            requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
        }, token).catch(e => {
            if (e.message.includes('already exists')) {
                console.log('Tab already exists.');
            } else {
                throw e;
            }
        });

        // Clear existing data and write new
        await sheetsRequest(`/values/${SHEET_NAME}!A:I:clear`, 'POST', {}, token);
        await sheetsRequest(`/values/${SHEET_NAME}!A1:I${rows.length}?valueInputOption=USER_ENTERED`, 'PUT', { values: rows }, token);

        console.log('Bulk import complete!');
    } catch (e: any) {
        console.error('Import failed:', e.message);
    }
}

main();
