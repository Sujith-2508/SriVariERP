
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

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

async function main() {
    const token = await getAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Ledger Vouchers!A1:G5000`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    const data = await response.json();
    fs.writeFileSync('ledger_sample_5000.json', JSON.stringify(data.values, null, 2));
    console.log('Sample saved to ledger_sample_5000.json');
}

main().catch(console.error);
