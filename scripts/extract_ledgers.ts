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
const DEST_SHEET_NAME = 'Dealers, suppliers address';

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
    console.log('Starting Refined GST/Phone extraction...');
    const token = await getAccessToken();

    const ssMetadata = await sheetsRequest('?fields=sheets.properties.title,sheets.properties.sheetId', 'GET', null, token);
    const firstSheet = ssMetadata.sheets[0];
    const firstSheetName = firstSheet.properties.title;

    const dataResponse = await sheetsRequest(`/values/${firstSheetName}!A:L`, 'GET', null, token);
    const rows = dataResponse.values || [];
    console.log(`Read ${rows.length} rows.`);

    const dealers = [];
    dealers.push(['Business Name', 'Address', 'GST Number', 'Phone', 'Ledger Period']);

    for (let i = 0; i < rows.length; i++) {
        const colA = (rows[i][0] || '').trim();
        const colB = (rows[i][1] || '').trim();
        const colC = (rows[i][2] || '').trim();

        if (colA.toLowerCase().startsWith('ledger:')) {
            let name = colB || colA.replace(/Ledger:?/i, '').trim();
            if (!name) continue;

            const period = colC || (rows[i][6] || '');

            const addressRow = rows[i + 1] || [];
            let addressLine = (addressRow[1] || '').trim() || (addressRow[0] || '').trim();

            // Skip noise
            if (!addressLine || addressLine.toLowerCase() === 'date' || addressLine.toLowerCase() === 'particulars' || addressLine.match(/^\d+-[a-z]+-\d+/i)) {
                addressLine = '';
            }

            // --- Robust Extraction Logic ---

            // 1. GST NO / GST IN / GST: (15 chars)
            const gstPattern = /GST(?:\s*IN|\s*NO)?[:.]?\s*([A-Z0-9]{15})/i;
            const gstMatch = addressLine.match(gstPattern);
            let gst = gstMatch ? gstMatch[1].toUpperCase() : '';

            // 2. Phone / Phn / Cell / Mob / Tel: (10-12 digits)
            const phonePattern = /(?:CELL|MOB|PH|TEL|PHN|PHONE)[:.]?\s*(\d{10,12})/i;
            const phoneMatch = addressLine.match(phonePattern);
            let phone = phoneMatch ? phoneMatch[1] : '';

            // 3. Clean Address: Remove matches and lingering labels
            let address = addressLine;
            if (gstMatch) {
                address = address.replace(gstMatch[0], '');
            }
            if (phoneMatch) {
                address = address.replace(phoneMatch[0], '');
            }

            // Extra cleanup for cases where labels remain but numbers are gone or caught separately
            address = address.replace(/GST(?:\s*IN|\s*NO)?[:.]?/gi, '');
            address = address.replace(/(?:CELL|MOB|PH|TEL|PHN|PHONE)[:.]?/gi, '');

            // Cleanup separators and whitespace
            address = address.replace(/,\s*,/g, ',')
                .replace(/^,/, '')
                .replace(/,$/, '')
                .replace(/\s+/g, ' ')
                .trim();

            dealers.push([name, address, gst, phone, period]);
            console.log(`Extracted: ${name} | GST: ${gst || 'None'} | Ph: ${phone || 'None'}`);
        }
    }

    try {
        const updatedMetadata = await sheetsRequest('?fields=sheets.properties.title,sheets.properties.sheetId', 'GET', null, token);
        const targetSheet = updatedMetadata.sheets.find((s: any) => s.properties.title === DEST_SHEET_NAME);
        const targetSheetId = targetSheet.properties.sheetId;

        await sheetsRequest(`/values/${DEST_SHEET_NAME}!A:E:clear`, 'POST', {}, token);
        await sheetsRequest(`/values/${DEST_SHEET_NAME}!A1:E${dealers.length}?valueInputOption=USER_ENTERED`, 'PUT', { values: dealers }, token);

        console.log(`Finished! Extracted ${dealers.length - 1} dealers with cleaned GST/Phone fields.`);

    } catch (e: any) {
        console.error('Update Failed:', e.message);
    }
}

main();
