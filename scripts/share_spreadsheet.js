const fs = require('fs');
const crypto = require('crypto');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const SERVICE_ACCOUNT_KEY = env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);

const SPREADSHEET_ID = '1ksFhdJK6-spJeuC2GHR2y0nm--_Sfzp';
const TARGET_EMAIL = 'maharajagrouppvtltd@gmail.com';

async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    const header = (b) => Buffer.from(JSON.stringify(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const claims = header({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
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
    try {
        console.log(`Authenticating...`);
        const token = await getAccessToken();

        console.log(`Sharing spreadsheet ${SPREADSHEET_ID} with ${TARGET_EMAIL}...`);

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${SPREADSHEET_ID}/permissions?sendNotificationEmail=true`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                role: 'writer',
                type: 'user',
                emailAddress: TARGET_EMAIL
            })
        });

        const result = await response.json();
        if (response.ok) {
            console.log('SUCCESS: Permission created.');
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.error('ERROR sharing spreadsheet:');
            console.error(JSON.stringify(result, null, 2));
        }
    } catch (e) {
        console.error('FAILED:', e.message);
    }
}

main();
