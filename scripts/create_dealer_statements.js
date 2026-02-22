const fs = require('fs');
const { google } = require('googleapis');

async function main() {
    try {
        console.log('--- STARTING UPDATE PROCESS (EXISTING SHEET) ---');

        // 1. Setup Authentication
        const envFile = fs.readFileSync('.env.local', 'utf-8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const [key, ...value] = line.split('=');
            if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
        });

        const sleep = (ms) => new Promise(res => setTimeout(res, ms));

        const SERVICE_ACCOUNT_KEY = env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
        const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
        });

        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        const drive = google.drive({ version: 'v3', auth: authClient });

        const TARGET_ID = '1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0'; // Tally Sheet
        const EMAIL = 'maharajagrouppvtltd@gmail.com';

        // 2. Fetch Source Data (from same sheet)
        console.log('Reading Refined Dealers...');
        const refinedRes = await sheets.spreadsheets.values.get({ spreadsheetId: TARGET_ID, range: 'refined dealers!A:E' });
        const refinedDealers = refinedRes.data.values || [];
        console.log(`- Read ${refinedDealers.length} rows.`);

        console.log('Reading Ledger Vouchers...');
        const voucherRes = await sheets.spreadsheets.values.get({ spreadsheetId: TARGET_ID, range: 'Ledger Vouchers!A:H' });
        const voucherRows = voucherRes.data.values || [];
        console.log(`- Read ${voucherRows.length} rows.`);

        // 3. Process Data
        console.log('Processing data...');
        const refinedNames = refinedDealers.slice(1).map(r => (r[0] || '').trim().toLowerCase()).filter(Boolean);
        const statements = {};
        let current = '';

        for (const row of voucherRows) {
            const colA = (row[0] || '').trim();
            const colB = (row[1] || '').trim();
            if (colA.toLowerCase().startsWith('ledger:')) {
                current = (colB || colA.replace(/Ledger:?/i, '').trim()).toLowerCase();
                if (refinedNames.includes(current) && !statements[current]) {
                    statements[current] = [['Date', 'Particulars', 'Vch Type', 'Vch No', 'Debit', 'Credit']];
                } else if (!refinedNames.includes(current)) {
                    current = '';
                }
                continue;
            }
            if (current && statements[current]) {
                const type = (row[2] || '').trim().toLowerCase();
                if (type === 'sales' || type === 'receipt') {
                    statements[current].push([row[0] || '', row[1] || '', row[2] || '', row[3] || '', row[6] || '', row[7] || '']);
                }
            }
        }

        // 4. Create Tabs for Dealers in Existing Sheet
        console.log('Fetching existing tabs to avoid duplicates...');
        const existingSS = await sheets.spreadsheets.get({ spreadsheetId: TARGET_ID });
        const existingTitles = existingSS.data.sheets.map(s => s.properties.title.toUpperCase());

        console.log('Creating dealer tabs...');
        const dealerKeys = Object.keys(statements).sort();
        const addRequests = [];

        for (const k of dealerKeys) {
            const title = k.substring(0, 31).toUpperCase().replace(/[:\\\/\?\*\[\]]/g, '');
            if (!existingTitles.includes(title)) {
                addRequests.push({ addSheet: { properties: { title } } });
            }
        }

        if (addRequests.length > 0) {
            for (let i = 0; i < addRequests.length; i += 20) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: TARGET_ID, resource: { requests: addRequests.slice(i, i + 20) }
                });
                console.log(`- Created ${Math.min(i + 20, addRequests.length)} tabs...`);
                await sleep(1000);
            }
        } else {
            console.log('- No new tabs needed.');
        }

        // 5. Write Data to Dealer Tabs
        console.log('Writing statement data...');
        const valChunks = dealerKeys.map(k => ({
            range: `'${k.substring(0, 31).toUpperCase().replace(/[:\\\/\?\*\[\]]/g, '')}'!A1`,
            values: statements[k]
        }));

        for (let i = 0; i < valChunks.length; i += 40) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: TARGET_ID,
                resource: { valueInputOption: 'USER_ENTERED', data: valChunks.slice(i, i + 40) }
            });
            console.log(`- Populated ${Math.min(i + 40, valChunks.length)} statements...`);
            await sleep(1000);
        }

        // 6. Formatting widths
        console.log('Formatting widths...');
        const finalMeta = await sheets.spreadsheets.get({ spreadsheetId: TARGET_ID });
        const resReqs = [];
        const targetedTabs = dealerKeys.map(k => k.substring(0, 31).toUpperCase().replace(/[:\\\/\?\*\[\]]/g, ''));

        finalMeta.data.sheets.forEach(s => {
            const title = s.properties.title.toUpperCase();
            if (targetedTabs.includes(title)) {
                const id = s.properties.sheetId;
                resReqs.push(
                    { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 4, endIndex: 6 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } }
                );
            }
        });

        if (resReqs.length > 0) {
            for (let i = 0; i < resReqs.length; i += 400) {
                await sheets.spreadsheets.batchUpdate({ spreadsheetId: TARGET_ID, resource: { requests: resReqs.slice(i, i + 400) } });
                await sleep(1000);
            }
        }

        // 7. Sharing check
        console.log(`Ensuring ${EMAIL} has access...`);
        try {
            await drive.permissions.create({
                fileId: TARGET_ID,
                requestBody: { role: 'writer', type: 'user', emailAddress: EMAIL },
                sendNotificationEmail: true
            });
        } catch (shareErr) {
            if (shareErr.message && shareErr.message.includes('already exists')) {
                console.log('- User already has access.');
            } else {
                console.log('- Permission check/add done (or already exists).');
            }
        }

        console.log('--- SUCCESS ---');
        console.log(`Link: https://docs.google.com/spreadsheets/d/${TARGET_ID}`);

    } catch (e) {
        console.error('FAILED:');
        console.error(e);
    }
}

main();
