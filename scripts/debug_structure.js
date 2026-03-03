const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SPREADSHEET_ID = '1CxjsldaglA9AM0BIudjTjyX5E8mLTijMrLWw4oZ17PA';
const serviceAccountKey = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;

async function debugTabs() {
    try {
        if (!serviceAccountKey) {
            console.error('NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY not found in .env.local');
            return;
        }

        const credentials = JSON.parse(serviceAccountKey);

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
        });

        const tabNames = spreadsheet.data.sheets.map(s => s.properties.title);
        console.log('Tabs found:', tabNames);

        const results = {};

        // Focus on ARUN RUBBER PRODUCTS as seen in screenshot
        const tabsToInspect = tabNames.filter(t => t.includes('ARUN') || t === 'Summary').slice(0, 3);

        for (const tab of tabsToInspect) {
            console.log(`Inspecting tab: ${tab}`);
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `'${tab}'!A1:I500`,
            });

            const rows = res.data.values || [];
            results[tab] = {
                rowCount: rows.length,
                dateHeaderIndex: rows.findIndex(r => r[0] && r[0].toString().trim() === 'Date'),
                sampleRows: rows.slice(0, 50),
                rowsAround92: rows.slice(85, 110),
            };
        }

        fs.writeFileSync('debug_sheet_detailed.json', JSON.stringify(results, null, 2));
        console.log('Results saved to debug_sheet_detailed.json');

    } catch (error) {
        console.error('Error:', error);
    }
}

debugTabs();
