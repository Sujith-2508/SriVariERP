import fs from 'fs';
import crypto from 'crypto';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const SPREADSHEET_ID = '1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0';
const SERVICE_ACCOUNT_KEY = env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
const REFINED_SHEET_NAME = 'refined dealers';

if (!SERVICE_ACCOUNT_KEY) {
    console.error('SERVICE_ACCOUNT_KEY not found');
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
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.json();
}

async function main() {
    const token = await getAccessToken();
    const dataResponse = await sheetsRequest(`/values/Dealers, suppliers address!A1:E50`, 'GET', null, token);
    const rows = dataResponse.values || [];

    console.log('--- TARGETED GST CHECK ---');
    const targetNames = ['Gifts & Metal', 'Indian Metal Mart', 'J Flora', 'Jagan Super Store', 'Janatha Metals'];

    rows.forEach((row: any, i: number) => {
        const name = row[0];
        if (targetNames.some(tn => name?.includes(tn)) || row[1]?.includes('NO')) {
            console.log(`[${i + 1}] ${name || 'N/A'}`);
            console.log(`    GST: ${row[2] || 'EMPTY'}`);
            console.log(`    Address: ${row[1] || 'N/A'}`);
        }
    });
}

main();
