/**
 * Google Drive Service
 * 
 * Uploads invoice PDFs to Google Drive using service account JWT auth.
 * Organizes files in per-dealer folders:
 *   SriVari Invoices/
 *     DealerName/
 *       Invoices/
 *       Receipts/
 * 
 * Shares the root folder with the user-configured email (from Settings).
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

// Caches
let cachedDriveToken: { token: string; expires: number } | null = null;
let cachedRootFolderId: string | null = null;
const dealerFolderCache: Record<string, { invoices: string; receipts: string }> = {};

const ROOT_FOLDER_NAME = 'SriVari Invoices';
const SUPPLIER_STATEMENTS_FOLDER = 'Supplier Statements';
const DEALER_STATEMENTS_FOLDER = 'Dealer Statements';
const DRIVE_EMAIL_KEY = 'googleDriveEmail';

// --- Auth helpers (same pattern as googleSheetWriter.ts) ---

function base64url(str: string): string {
    const b64 = btoa(str);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlFromBuffer(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
    const pemContents = pem
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\\n/g, '')
        .replace(/\n/g, '')
        .replace(/\s/g, '');

    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return crypto.subtle.importKey(
        'pkcs8',
        bytes.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
}

async function getDriveAccessToken(): Promise<string> {
    if (cachedDriveToken && Date.now() < cachedDriveToken.expires) {
        return cachedDriveToken.token;
    }

    const serviceAccountKey = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY is not set');
    }

    const credentials = JSON.parse(serviceAccountKey);
    const now = Math.floor(Date.now() / 1000);

    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    }));

    const signInput = `${header}.${claims}`;
    const privateKey = await importPrivateKey(credentials.private_key);
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        privateKey,
        new TextEncoder().encode(signInput)
    );

    const jwt = `${signInput}.${base64urlFromBuffer(signature)}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenResponse.ok) {
        const err = await tokenResponse.text();
        throw new Error(`Failed to get Drive access token: ${err}`);
    }

    const tokenData = await tokenResponse.json();
    cachedDriveToken = {
        token: tokenData.access_token,
        expires: Date.now() + (tokenData.expires_in - 60) * 1000,
    };

    console.log('[DriveService] Got access token');
    return cachedDriveToken.token;
}

// --- Folder Management ---

/** Find or create a folder by name under a given parent. Supports multiple possible names for fallback. */
async function findOrCreateSubFolder(
    token: string,
    folderName: string | string[],
    parentId: string | null
): Promise<string> {
    const names = Array.isArray(folderName) ? folderName : [folderName];

    // Search for existing folder with any of the names
    for (const name of names) {
        let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (parentId) {
            query += ` and '${parentId}' in parents`;
        }
        const searchUrl = `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name)`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (searchRes.ok) {
            const data = await searchRes.json();
            if (data.files && data.files.length > 0) {
                console.log(`[DriveService] Found folder '${name}':`, data.files[0].id);
                return data.files[0].id;
            }
        }
    }

    // If none found, create the FIRST name in the list
    const primaryName = names[0];
    const metadata: any = {
        name: primaryName,
        mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) {
        metadata.parents = [parentId];
    }

    const createRes = await fetch(DRIVE_API, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
    });

    if (!createRes.ok) {
        const err = await createRes.text();
        throw new Error(`Failed to create folder '${primaryName}': ${err}`);
    }

    const folder = await createRes.json();
    console.log(`[DriveService] Created folder '${primaryName}':`, folder.id);
    return folder.id;
}

/** Share a folder with the configured email (if set) */
async function shareFolderWithEmail(token: string, folderId: string): Promise<void> {
    if (typeof window === 'undefined') return;

    const email = localStorage.getItem(DRIVE_EMAIL_KEY);
    if (!email || !email.trim()) return;

    try {
        // Check if already shared
        const permRes = await fetch(`${DRIVE_API}/${folderId}/permissions?fields=permissions(emailAddress,role)`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!permRes.ok) {
            const err = await permRes.text();
            console.warn(`[DriveService] Could not check permissions for ${folderId}:`, err);
        } else {
            const permData = await permRes.json();
            const alreadyShared = permData.permissions?.some(
                (p: any) => p.emailAddress?.toLowerCase() === email.trim().toLowerCase()
            );
            if (alreadyShared) return;
        }

        // Share with the email (avoiding 403 by disabling notification if needed)
        await fetch(`${DRIVE_API}/${folderId}/permissions?sendNotificationEmail=false`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                role: 'writer',
                type: 'user',
                emailAddress: email.trim(),
            }),
        });
        console.log(`[DriveService] Shared folder with ${email.trim()}`);
    } catch (e) {
        console.warn('[DriveService] Failed to share folder:', e);
    }
}

/** Get or create the root "SriVari Invoices" folder and share it */
async function getRootFolder(token: string): Promise<string> {
    if (cachedRootFolderId) return cachedRootFolderId;

    cachedRootFolderId = await findOrCreateSubFolder(token, ROOT_FOLDER_NAME, null);

    // Share root folder with configured email
    await shareFolderWithEmail(token, cachedRootFolderId);

    return cachedRootFolderId;
}

/**
 * Get or create the per-dealer folder tree:
 *   SriVari Invoices / DealerName / Invoices
 *   SriVari Invoices / DealerName / Receipts
 */
async function getDealerFolders(
    token: string,
    dealerName: string
): Promise<{ invoices: string; receipts: string }> {
    const sanitized = dealerName.replace(/[^a-zA-Z0-9\s]/g, '').trim();

    if (dealerFolderCache[sanitized]) {
        return dealerFolderCache[sanitized];
    }

    const rootId = await getRootFolder(token);
    const dealerId = await findOrCreateSubFolder(token, sanitized, rootId);
    const invoicesId = await findOrCreateSubFolder(token, 'Invoices', dealerId);
    const receiptsId = await findOrCreateSubFolder(token, 'Receipts', dealerId);

    dealerFolderCache[sanitized] = { invoices: invoicesId, receipts: receiptsId };
    return dealerFolderCache[sanitized];
}

/** Get the ID of a sync folder (Supplier or Dealer Statements) */
export async function getSyncFolderId(name: string): Promise<string> {
    const token = await getDriveAccessToken();

    // Check for "SUPPLIER_STATEMENTS_FOLDER" specifically as a fallback for Supplier Statements
    const searchNames = name === SUPPLIER_STATEMENTS_FOLDER
        ? [SUPPLIER_STATEMENTS_FOLDER, 'SUPPLIER_STATEMENTS_FOLDER']
        : [name];

    const folderId = await findOrCreateSubFolder(token, searchNames, null);
    await shareFolderWithEmail(token, folderId);
    return folderId;
}

/** List all files in a folder */
export async function listFiles(folderId: string): Promise<any[]> {
    const token = await getDriveAccessToken();
    const query = `'${folderId}' in parents and trashed = false`;
    const url = `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`;

    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        throw new Error(`Failed to list files: ${await res.text()}`);
    }

    const data = await res.json();
    return data.files || [];
}

/** Search for files by name (supports partial matches and across all drives) */
export async function findFilesByName(name: string): Promise<any[]> {
    const token = await getDriveAccessToken();
    const query = `name contains '${name}' and trashed = false`;
    const url = `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        throw new Error(`Failed to find files: ${await res.text()}`);
    }

    const data = await res.json();
    return data.files || [];
}

/** Download a binary file (Excel) */
export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
    const token = await getDriveAccessToken();
    const url = `${DRIVE_API}/${fileId}?alt=media`;

    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        throw new Error(`Failed to download file: ${await res.text()}`);
    }

    return res.arrayBuffer();
}

/** Export a Google Doc (Sheet) as a specific format (.xlsx) */
export async function exportFile(fileId: string, mimeType: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): Promise<ArrayBuffer> {
    const token = await getDriveAccessToken();
    const url = `${DRIVE_API}/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`;

    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        throw new Error(`Failed to export file: ${await res.text()}`);
    }

    return res.arrayBuffer();
}

// --- Upload ---

/**
 * Upload an invoice PDF to Google Drive under the dealer's Invoices folder.
 */
export async function uploadInvoicePDF(
    base64Data: string,
    fileName: string,
    dealerName: string
): Promise<{ id: string; webViewLink: string }> {
    const token = await getDriveAccessToken();
    const folders = await getDealerFolders(token, dealerName);

    return uploadPdfToFolder(token, base64Data, fileName, folders.invoices);
}

/** Internal: upload a PDF to a specific folder */
async function uploadPdfToFolder(
    token: string,
    base64Data: string,
    fileName: string,
    folderId: string
): Promise<{ id: string; webViewLink: string }> {
    const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/, '');

    const boundary = '---invoice_upload_boundary---';
    const metadata = JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: 'application/pdf',
    });

    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
    const filePart = `--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n${cleanBase64}\r\n--${boundary}--`;
    const body = metadataPart + filePart;

    const uploadRes = await fetch(
        `${DRIVE_API_BASE}?uploadType=multipart&fields=id,webViewLink`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: body,
        }
    );

    if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Drive upload failed: ${err}`);
    }

    const result = await uploadRes.json();
    console.log('[DriveService] PDF uploaded:', result.id, result.webViewLink);
    return { id: result.id, webViewLink: result.webViewLink || '' };
}

/** Upload a simple text/JSON file to Drive */
export async function uploadTextFile(
    content: string,
    fileName: string,
    folderId: string,
    mimeType: string = 'text/plain'
): Promise<string> {
    const token = await getDriveAccessToken();
    const boundary = '---text_upload_boundary---';
    const metadata = JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: mimeType,
    });

    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
    const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n--${boundary}--`;
    const body = metadataPart + filePart;

    const res = await fetch(`${DRIVE_API_BASE}?uploadType=multipart`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: body,
    });

    if (!res.ok) throw new Error(`Text upload failed: ${await res.text()}`);
    const data = await res.json();
    return data.id;
}

/**
 * Build the standard invoice filename.
 * Format: "INV{invoiceNo}_{dealerName}_{dd-MM-yyyy}.pdf"
 */
export function buildInvoiceFileName(
    invoiceNo: string,
    dealerName: string,
    date: Date
): string {
    const sanitizedDealer = dealerName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${invoiceNo}_${sanitizedDealer}_${dd}-${mm}-${yyyy}.pdf`;
}
