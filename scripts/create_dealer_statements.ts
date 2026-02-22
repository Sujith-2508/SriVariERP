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
const REFINED_DEALERS_TAB = 'refined dealers';
const LEDGER_VOUCHERS_TAB = 'Ledger Vouchers';
const NEW_SPREADSHEET_NAME = 'Dealers data and statement';

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
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
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

async function sheetsRequest(id: string, path: string, method = 'GET', body: any = null, token: string) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`;
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

async function createSpreadsheet(title: string, token: string) {
    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: { title } }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Create Spreadsheet failed: ${err}`);
    }
    return response.json();
}

async function main() {
    try {
        console.log('Authenticating...');
        const token = await getAccessToken();

        // 1. Fetch Refined Dealers
        console.log(`Fetching refined dealers from tab: ${REFINED_DEALERS_TAB}...`);
        const refinedData = await sheetsRequest(SPREADSHEET_ID, `/values/${REFINED_DEALERS_TAB}!A:E`, 'GET', null, token);
        const refinedDealers = refinedData.values || [];
        if (refinedDealers.length <= 1) {
            console.error('No refined dealers found.');
            return;
        }
        console.log(`Found ${refinedDealers.length - 1} refined dealers.`);

        // Create a list of dealer names for matching
        const refinedDealerNames = refinedDealers.slice(1).map(row => row[0].trim().toLowerCase());

        // 2. Create the new Spreadsheet
        console.log(`Creating new spreadsheet: ${NEW_SPREADSHEET_NAME}...`);
        const newSS = await createSpreadsheet(NEW_SPREADSHEET_NAME, token);
        const newSSID = newSS.spreadsheetId;
        console.log(`New Spreadsheet ID: ${newSSID}`);
        console.log(`URL: https://docs.google.com/spreadsheets/d/${newSSID}`);

        // 3. Populate "Dealers data" tab
        console.log('Populating "Dealers data" tab...');
        // The first sheet is created by default, but we should rename it
        const firstSheetId = newSS.sheets[0].properties.sheetId;
        await sheetsRequest(newSSID, ':batchUpdate', 'POST', {
            requests: [
                { updateSheetProperties: { properties: { sheetId: firstSheetId, title: 'Dealers data' }, fields: 'title' } }
            ]
        }, token);
        await sheetsRequest(newSSID, `/values/'Dealers data'!A1?valueInputOption=USER_ENTERED`, 'PUT', { values: refinedDealers }, token);

        // 4. Fetch Ledger Vouchers
        console.log('Fetching ledger vouchers (this may take a moment)...');
        const voucherData = await sheetsRequest(SPREADSHEET_ID, `/values/'${LEDGER_VOUCHERS_TAB}'!A:H`, 'GET', null, token);
        const voucherRows = voucherData.values || [];
        console.log(`Read ${voucherRows.length} voucher rows.`);

        // 5. Group Vouchers by Dealer
        console.log('Grouping vouchers by dealer...');
        const dealerStatements: Record<string, any[][]> = {};
        let currentDealer = '';

        for (let i = 0; i < voucherRows.length; i++) {
            const row = voucherRows[i];
            const colA = (row[0] || '').trim();
            const colB = (row[1] || '').trim();

            if (colA.toLowerCase().startsWith('ledger:')) {
                currentDealer = (colB || colA.replace(/Ledger:?/i, '').trim()).toLowerCase();
                if (refinedDealerNames.includes(currentDealer)) {
                    if (!dealerStatements[currentDealer]) {
                        dealerStatements[currentDealer] = [['Date', 'Particulars', 'Vch Type', 'Vch No', 'Debit', 'Credit']];
                    }
                } else {
                    currentDealer = ''; // Ignore if not refined
                }
                continue;
            }

            if (currentDealer && dealerStatements[currentDealer]) {
                const vchType = (row[2] || '').trim().toLowerCase();
                // Filter for Sales and Receipt
                if (vchType === 'sales' || vchType === 'receipt') {
                    // Columns: Date, Particulars, Vch Type, Vch No, Debit, Credit
                    dealerStatements[currentDealer].push([
                        row[0] || '', // Date
                        row[1] || '', // Particulars
                        row[2] || '', // Vch Type
                        row[3] || '', // Vch No
                        row[6] || '', // Debit
                        row[7] || '', // Credit
                    ]);
                }
            }
        }

        // 6. Create Tabs for each dealer
        console.log('Creating dealer statement tabs...');
        const batchRequests = [];
        const populateRequests = [];

        for (const dealerName of refinedDealerNames) {
            const statementRows = dealerStatements[dealerName] || [['Date', 'Particulars', 'Vch Type', 'Vch No', 'Debit', 'Credit'], ['No statement data found.']];

            // Limit tab name to 31 chars (Googe Sheets limit)
            const tabName = dealerName.substring(0, 31).toUpperCase();

            batchRequests.push({ addSheet: { properties: { title: tabName } } });

            populateRequests.push({
                range: `'${tabName}'!A1`,
                values: statementRows
            });
        }

        if (batchRequests.length > 0) {
            console.log(`Adding ${batchRequests.length} sheets...`);
            // We need to do this in batches if there are many dealers
            const CHUNK_SIZE = 20;
            for (let i = 0; i < batchRequests.length; i += CHUNK_SIZE) {
                const chunk = batchRequests.slice(i, i + CHUNK_SIZE);
                await sheetsRequest(newSSID, ':batchUpdate', 'POST', { requests: chunk }, token);
                console.log(`Created ${i + chunk.length}/${batchRequests.length} tabs...`);
            }
        }

        // 7. Write data to each tab
        console.log('Writing data to dealer tabs...');
        const CHUNK_SIZE = 50;
        for (let i = 0; i < populateRequests.length; i += CHUNK_SIZE) {
            const chunk = populateRequests.slice(i, i + CHUNK_SIZE);
            await sheetsRequest(newSSID, '/values:batchUpdate', 'POST', {
                valueInputOption: 'USER_ENTERED',
                data: chunk
            }, token);
            console.log(`Populated ${i + chunk.length}/${populateRequests.length} tabs...`);
        }

        // 8. Resize columns for all tabs
        console.log('Formatting tabs...');
        const finalMetadata = await sheetsRequest(newSSID, '?fields=sheets.properties.title,sheets.properties.sheetId', 'GET', null, token);
        const resizeRequests = [];
        for (const sheet of finalMetadata.sheets) {
            const sId = sheet.properties.sheetId;
            resizeRequests.push(
                { updateDimensionProperties: { range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } }, // Date
                { updateDimensionProperties: { range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } }, // Particulars
                { updateDimensionProperties: { range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } }, // Vch Type
                { updateDimensionProperties: { range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },  // Vch No
                { updateDimensionProperties: { range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 4, endIndex: 6 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } }  // Debit/Credit
            );
        }

        // Batch resize
        for (let i = 0; i < resizeRequests.length; i += 200) {
            await sheetsRequest(newSSID, ':batchUpdate', 'POST', { requests: resizeRequests.slice(i, i + 200) }, token);
        }

        console.log('SUCCESS!');
        console.log(`New Spreadsheet Created: ${NEW_SPREADSHEET_NAME}`);
        console.log(`URL: https://docs.google.com/spreadsheets/d/${newSSID}`);

    } catch (e: any) {
        console.error('FAILED:', e.message);
    }
}

main();
