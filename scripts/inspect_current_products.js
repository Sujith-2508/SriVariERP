const fs = require('fs');
const crypto = require('crypto');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
        const k = line.slice(0, eqIdx).trim();
        const v = line.slice(eqIdx + 1).trim().replace(/^"(.*)"$/, '$1');
        env[k] = v;
    }
});

const SPREADSHEET_ID = '1ksFhdJK6-sQxVBIkqqJdRKPhm--_SfzpJeuC2GHR2y0';
const credentials = JSON.parse(env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY);

async function getToken() {
    const now = Math.floor(Date.now() / 1000);
    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const h = b64({ alg: 'RS256', typ: 'JWT' });
    const c = b64({ iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now });
    const sig = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + c), credentials.private_key).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + h + '.' + c + '.' + sig
    });
    return (await res.json()).access_token;
}

async function main() {
    const token = await getToken();
    const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID;

    // Read first 10 rows of CurrentProducts (no space)
    const r = await (await fetch(base + '/values/CurrentProducts!A1:Z10', { headers: { Authorization: 'Bearer ' + token } })).json();

    const result = { rows: r.values || [], error: r.error || null };
    fs.writeFileSync('scripts/cp_debug.json', JSON.stringify(result, null, 2), 'utf8');
}

main().catch(e => fs.writeFileSync('scripts/cp_debug.json', JSON.stringify({ fatal: e.message }), 'utf8'));
