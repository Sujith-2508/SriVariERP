const { google } = require('googleapis');
const fs = require('fs');

async function findStartRow() {
    try {
        const envFile = fs.readFileSync('.env.local', 'utf-8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const [key, ...value] = line.split('=');
            if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
        });

        const SERVICE_ACCOUNT_KEY = env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
        const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);
        const auth = new google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = '1CxjsldaglA9AM0BIudjTjyX5E8mLTijMrLWw4oZ17PA';

        console.log('--- Searching for "Date" header in LAKSHMI COOKWARE ---');
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'LAKSHMI COOKWARE!A1:A100' });
        const rows = res.data.values || [];

        rows.forEach((row, i) => {
            if (row[0] === 'Date') console.log(`🎯 Found "Date" at row ${i + 1}`);
        });

    } catch (err) {
        console.error('ERROR:', err.message);
    }
}

findStartRow();
