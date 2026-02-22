
const fs = require('fs');
const crypto = require('crypto');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const SPREADSHEET_ID = '1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0';
const credentials = JSON.parse(env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY);

async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    const header = (b) => Buffer.from(JSON.stringify(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const claims = header({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    });
    const headerPart = header({ alg: 'RS256', typ: 'JWT' });
    const signInput = `${headerPart}.${claims}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signInput), credentials.private_key);
    const jwt = `${signInput}.${signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const data = await response.json();
    return data.access_token;
}

async function sheetsRequest(path, method = 'GET', body = null, token) {
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

const REFINED_SUPPLIER_NAME = 'refined suppliers';
const DEST_SHEET_NAME = 'suppliers purchase bills and payments';

async function main() {
    console.log('Starting Supplier Voucher extraction...');
    const token = await getAccessToken();

    // 1. Get Refined Supplier Names
    const supplierListResponse = await sheetsRequest(`/values/${REFINED_SUPPLIER_NAME}!A:A`, 'GET', null, token);
    const refinedSuppliers = (supplierListResponse.values || []).slice(1).map(row => (row[0] || '').trim().toLowerCase()).filter(Boolean);
    console.log(`Filtering for ${refinedSuppliers.length} suppliers.`);

    // 2. Read Ledger Vouchers
    console.log('Reading Ledger Vouchers (this may take a moment)...');
    const dataResponse = await sheetsRequest(`/values/Ledger Vouchers!A:L`, 'GET', null, token);
    const rows = dataResponse.values || [];
    console.log(`Scanning ${rows.length} rows.`);

    const collectedVouchers = [];
    collectedVouchers.push(['Supplier', 'Date', 'Particulars', 'Vch Type', 'Vch No.', 'Debit', 'Credit']);

    let currentSupplier = null;
    let isRefinedSupplier = false;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const colA = (row[0] || '').trim();
        const colB = (row[1] || '').trim();

        // 1. Detect new Ledger section
        if (colA.toLowerCase().startsWith('ledger:')) {
            currentSupplier = colB || colA.replace(/Ledger:?/i, '').trim();
            isRefinedSupplier = refinedSuppliers.includes(currentSupplier.toLowerCase());
            if (isRefinedSupplier) {
                console.log(`Extracting vouchers for: ${currentSupplier}`);
            }
            continue;
        }

        if (isRefinedSupplier) {
            const date = colA;
            const particulars = (row[2] || '').trim();
            const vchType = (row[3] || '').trim();
            const vchNo = (row[4] || '').trim();
            const debit = (row[5] || '').trim();
            const credit = (row[6] || '').trim();

            // 2. Handle Opening Balance row
            if (particulars.toLowerCase().includes('opening balance') || colA.toLowerCase().includes('opening balance')) {
                const amount = (credit || debit || '').replace(/,/g, '');
                if (amount && parseFloat(amount) !== 0) {
                    collectedVouchers.push([currentSupplier, 'Opening', 'Opening Balance', 'Purchase', 'OPENING', '', amount]);
                }
                continue;
            }

            // 3. Regular voucher row
            if (date && date.match(/^\d+-[a-z]+-\d+/i)) {
                // Skip summary/closing rows
                if (particulars.toLowerCase() === 'closing balance') continue;

                // Detect and standardize voucher type
                let mappedVchType = vchType;
                const vchLower = vchType.toLowerCase();

                // If it's a supplier ledger, Credit -> Purchase, Debit -> Payment
                if (!vchType) {
                    if (credit && !debit) mappedVchType = 'Purchase';
                    else if (debit && !credit) mappedVchType = 'Payment';
                } else {
                    // Handle typos and varying names
                    if (vchLower.includes('pur') || vchLower.includes('pru')) mappedVchType = 'Purchase';
                    else if (vchLower.includes('pay') || vchLower.includes('rec') || vchLower.includes('journal')) mappedVchType = 'Payment';
                }

                // If it has a date and either debit or credit, it's a transaction
                if (debit || credit) {
                    collectedVouchers.push([currentSupplier, date, particulars, mappedVchType, vchNo, debit, credit]);
                }
            }
        }
    }

    console.log(`Collected ${collectedVouchers.length - 1} vouchers.`);

    // 3. Write to new sheet
    try {
        const ssMetadata = await sheetsRequest('?fields=sheets.properties.title,sheets.properties.sheetId', 'GET', null, token);
        const exists = ssMetadata.sheets.some(s => s.properties.title === DEST_SHEET_NAME);

        if (!exists) {
            await sheetsRequest(':batchUpdate', 'POST', {
                requests: [{ addSheet: { properties: { title: DEST_SHEET_NAME } } }]
            }, token);
            console.log(`Created sheet: ${DEST_SHEET_NAME}`);
        }

        await sheetsRequest(`/values/${DEST_SHEET_NAME}!A:G:clear`, 'POST', {}, token);

        // Write in chunks if too large (Sheets API has limits)
        const chunkSize = 5000;
        for (let i = 0; i < collectedVouchers.length; i += chunkSize) {
            const chunk = collectedVouchers.slice(i, i + chunkSize);
            const range = `${DEST_SHEET_NAME}!A${i + 1}:G${i + chunk.length}`;
            await sheetsRequest(`/values/${range}?valueInputOption=USER_ENTERED`, 'PUT', { values: chunk }, token);
            console.log(`Wrote chunk ${Math.floor(i / chunkSize) + 1}`);
        }

        console.log('Finished extraction successfully.');

    } catch (e) {
        console.error('Update Failed:', e.message);
    }
}

main();
