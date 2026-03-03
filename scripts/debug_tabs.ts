import { google } from 'googleapis';
import fs from 'fs';

async function listTabs() {
    try {
        const envFile = fs.readFileSync('.env.local', 'utf-8');
        const env: Record<string, string> = {};
        envFile.split('\n').forEach(line => {
            const [key, ...value] = line.split('=');
            if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
        });

        const SERVICE_ACCOUNT_KEY = env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
        if (!SERVICE_ACCOUNT_KEY) {
            console.error('❌ Missing NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY in .env.local');
            process.exit(1);
        }

        const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);
        const auth = new google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = '1CxjsldaglA9AM0BIudjTjyX5E8mLTijMrLWw4oZ17PA';

        console.log(`📡 Fetching metadata for spreadsheet: ${spreadsheetId}...`);
        const response = await sheets.spreadsheets.get({ spreadsheetId });

        const tabs = response.data.sheets?.map(s => s.properties?.title) || [];
        console.log('✅ Found Tabs:', tabs);

    } catch (err: any) {
        console.error('❌ Failed to fetch spreadsheet metadata:', err.message);
    }
}

listTabs();
