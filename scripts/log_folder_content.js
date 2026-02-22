
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

    const folderName = 'Supplier Statements';
    const folderUrl = `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder'&${params}`;
    const folderRes = await fetch(folderUrl, { headers: { 'Authorization': `Bearer ${driveToken}` } });
    const folderData = await folderRes.json();

    if (!folderData.files || folderData.files.length === 0) {
        fs.writeFileSync('folder_content.txt', 'FOLDER_NOT_FOUND');
        return;
    }

    const folderId = folderData.files[0].id;
    let out = `FOLDER: ${folderName} (${folderId})\n`;

    const filesUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,modifiedTime)&${params}`;
    const filesRes = await fetch(filesUrl, { headers: { 'Authorization': `Bearer ${driveToken}` } });
    const filesData = await filesRes.json();

    if (filesData.files) {
        filesData.files.forEach(f => {
            out += `FILE: ${f.name} | ID: ${f.id} | MODIFIED: ${f.modifiedTime}\n`;
        });
    } else {
        out += 'NO_FILES';
    }
    fs.writeFileSync('folder_content.txt', out);
    console.log('DONE');
}

main().catch(console.error);
