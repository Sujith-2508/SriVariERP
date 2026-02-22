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

const SUPPLIER_FOLDER = 'Supplier Statements';
const DEALER_FOLDER = 'Dealer Statements';
const ROOT_FOLDER = 'SriVari Invoices';

// TARGET_EMAIL will be used for testing, in the app it comes from localStorage
const TARGET_EMAIL = process.argv[2] || 'maharajagrouppvtltd@gmail.com';

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

async function findOrCreateFolder(token, name, parentId = null) {
    console.log(`Checking for folder: ${name}`);
    let query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) query += ` and '${parentId}' in parents`;

    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
        console.log(`Found folder: ${name} (${searchData.files[0].id})`);
        return searchData.files[0].id;
    }

    console.log(`Creating folder: ${name}`);
    const metadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentId) metadata.parents = [parentId];

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });
    const folder = await createRes.json();
    console.log(`Created folder: ${name} (${folder.id})`);
    return folder.id;
}

async function shareFolder(token, folderId, email) {
    console.log(`Sharing folder ${folderId} with ${email}...`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            role: 'writer',
            type: 'user',
            emailAddress: email
        })
    });
    const result = await response.json();
    if (response.ok) {
        console.log(`Shared successfully.`);
    } else {
        console.error(`Failed to share:`, result);
    }
}

async function main() {
    try {
        const token = await getAccessToken();

        const rootId = await findOrCreateFolder(token, ROOT_FOLDER);
        await shareFolder(token, rootId, TARGET_EMAIL);

        const supplierId = await findOrCreateFolder(token, SUPPLIER_FOLDER);
        await shareFolder(token, supplierId, TARGET_EMAIL);

        const dealerId = await findOrCreateFolder(token, DEALER_FOLDER);
        await shareFolder(token, dealerId, TARGET_EMAIL);

        console.log('\nAll folders initialized and shared.');
    } catch (e) {
        console.error(e);
    }
}

main();
