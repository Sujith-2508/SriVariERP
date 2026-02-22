
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const credentials = JSON.parse(env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY);
const SUPPLIER_FOLDER_NAME = 'Supplier Statements';
const LOCAL_FILE_PATH = path.join('c:', 'Users', 'sujit', 'Documents', 'GitHub', 'Sri Vari project', 'Ledger of dealers and suppliers', 'Suupliers Statements', 'Supplier_Group3_Ledger.xlsx');

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

async function findOrCreateFolder(token, name) {
    const params = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
    const query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }

    console.log(`Folder "${name}" not found. Creating in private Drive...`);
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: name,
            mimeType: 'application/vnd.google-apps.folder'
        })
    });
    const folder = await createRes.json();
    return folder.id;
}

async function uploadFile(token, filePath, folderId) {
    const fileName = path.basename(filePath);
    const metadata = {
        name: fileName,
        parents: [folderId]
    };

    console.log(`Uploading ${fileName} to folder ${folderId}...`);

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const metadataStr = JSON.stringify(metadata);

    const body = Buffer.concat([
        Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + metadataStr),
        Buffer.from(delimiter + 'Content-Type: ' + contentType + '\r\n\r\n'),
        fs.readFileSync(filePath),
        Buffer.from(close_delim)
    ]);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/related; boundary=' + boundary,
            'Content-Length': body.length
        },
        body: body
    });

    const data = await res.json();
    if (res.ok) {
        console.log('Upload successful! File ID:', data.id);
        return data.id;
    } else {
        console.error('Upload failed:', JSON.stringify(data, null, 2));
        return null;
    }
}

async function shareWithUser(token, fileId, email) {
    if (!email) return;
    console.log(`Sharing file ${fileId} with ${email}...`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`, {
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
    if (res.ok) console.log('Shared successfully.');
}

async function main() {
    try {
        const token = await getAccessToken();
        let folderId = await findOrCreateFolder(token, SUPPLIER_FOLDER_NAME);

        const fileId = await uploadFile(token, LOCAL_FILE_PATH, folderId);
        if (fileId) {
            // Try to share with the user's email if possible
            // In a script, we don't have localStorage, so we'll skip or use a hardcoded one if known
            // But the service account creates it, so it owns it.
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
