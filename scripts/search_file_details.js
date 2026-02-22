
const fs = require('fs');
const crypto = require('crypto');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});
const credentials = JSON.parse(env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY);

async function getAccessToken(scope) {
    const now = Math.floor(Date.now() / 1000);
    const header = (b) => Buffer.from(JSON.stringify(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const claims = header({ iss: credentials.client_email, scope: scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now });
    const headerPart = header({ alg: 'RS256', typ: 'JWT' });
    const signInput = `${headerPart}.${claims}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signInput), credentials.private_key);
    const jwt = `${signInput}.${signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
    const data = await response.json();
    return data.access_token;
}

async function main() {
    const driveToken = await getAccessToken('https://www.googleapis.com/auth/drive.readonly');
    const params = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

    const fileName = 'Supplier_Group3_Ledger';
    const url = `https://www.googleapis.com/drive/v3/files?q=name contains '${fileName}' and trashed=false&fields=files(id,name,parents,modifiedTime)&${params}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${driveToken}` } });
    const data = await res.json();

    let out = 'SEARCH_RESULTS:\n';
    if (data.files) {
        data.files.forEach(f => {
            out += `FILE: ${f.name} | ID: ${f.id} | MODIFIED: ${f.modifiedTime} | PARENTS: ${f.parents ? f.parents.join(',') : 'NONE'}\n`;
        });
    } else {
        out += 'NOT_FOUND';
    }
    fs.writeFileSync('file_search.txt', out);
    console.log('DONE');
}

main().catch(console.error);
