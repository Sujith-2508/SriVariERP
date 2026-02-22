
const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');

const SPREADSHEET_ID = '1X58XpXpXUaG3pTzR9E_0zE-eY4B4P-E6eR8R-w-0-0M'; // Replace with real ID
const REFINED_SUPPLIER_NAME = 'refined suppliers';

async function getAccessToken() {
    const keyPath = path.join(process.cwd(), 'service-account-key.json');
    if (!fs.existsSync(keyPath)) {
        throw new Error('Service account key not found');
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    return await client.getAccessToken();
}

async function sheetsRequest(path, method = 'GET', body = null, token) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/1X58XpXpXUaG3pTzR9E_0zE-eY4B4P-E6eR8R-w-0-0M${path}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token.token || token}`,
            'Content-Type': 'application/json',
        },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${await response.text()}`);
    }
    return await response.json();
}

async function main() {
    const token = await getAccessToken();

    // 1. Get Refined Supplier Names
    const supplierListResponse = await sheetsRequest(`/values/${REFINED_SUPPLIER_NAME}!A:A`, 'GET', null, token);
    const refinedSuppliers = (supplierListResponse.values || []).slice(1).map(row => (row[0] || '').trim().toLowerCase()).filter(Boolean);
    console.log(`Filtering for ${refinedSuppliers.length} suppliers.`);

    // 2. Read Ledger Vouchers
    console.log('Reading Ledger Vouchers...');
    const dataResponse = await sheetsRequest(`/values/Ledger Vouchers!A:L`, 'GET', null, token);
    const rows = dataResponse.values || [];

    let currentSupplier = null;
    let isRefinedSupplier = false;
    let samplesShown = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const colA = (row[0] || '').trim();
        const colB = (row[1] || '').trim();

        if (colA.toLowerCase().startsWith('ledger:')) {
            currentSupplier = colB || colA.replace(/Ledger:?/i, '').trim();
            isRefinedSupplier = refinedSuppliers.includes(currentSupplier.toLowerCase());
            continue;
        }

        if (isRefinedSupplier) {
            const date = colA;
            if (date && date.match(/^\d+-[a-z]+-\d+/i)) {
                console.log(`Row ${i + 1} [${currentSupplier}]:`, JSON.stringify(row));
                samplesShown++;
                if (samplesShown > 50) break;
            }
        }
    }
}

main().catch(console.error);
