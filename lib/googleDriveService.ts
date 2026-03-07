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
let cachedErpInvoicesFolderId: string | null = null;
const dealerFolderCache: Record<string, { invoices: string; receipts: string }> = {};
const monthFolderCache: Record<string, string> = {}; // "February 2026" → folderId

const ROOT_FOLDER_NAME = 'SriVari Invoices';
const ERP_INVOICES_FOLDER = 'ERP Invoices';
const SUPPLIER_STATEMENTS_FOLDER = 'Supplier Statements';
const DEALER_STATEMENTS_FOLDER = 'Dealer Statements';
const WHATSAPP_UPLOADS_FOLDER = 'WhatsApp Documents';
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

/**
 * Get a Drive OAuth token from Electron IPC (user's own account = has storage quota).
 * Returns null if not running in Electron or Drive not connected yet.
 */
async function getOAuthAccessToken(): Promise<string | null> {
    try {
        // 1. Try Electron IPC first
        const electron = (window as any).electron;
        if (electron?.drive?.getAccessToken) {
            const token = await electron.drive.getAccessToken();
            if (token) return token;
        }

        // 2. Fallback to Browser localStorage for Web Version
        if (typeof window !== 'undefined') {
            const tokenJson = localStorage.getItem('drive_token');
            if (tokenJson) {
                const tokens = JSON.parse(tokenJson);
                // Check if expired
                if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60000) {
                    return tokens.access_token;
                }

                // If expired, try to refresh via standard web fetch
                const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || localStorage.getItem('google_oauth_client_id');
                const clientSecret = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET || localStorage.getItem('google_oauth_client_secret');

                if (tokens.refresh_token && clientId && clientSecret) {
                    const resp = await fetch('https://oauth2.googleapis.com/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            client_id: clientId,
                            client_secret: clientSecret,
                            refresh_token: tokens.refresh_token,
                            grant_type: 'refresh_token'
                        })
                    });
                    const result = await resp.json();
                    if (result.access_token) {
                        const updated = {
                            ...tokens,
                            access_token: result.access_token,
                            expires_at: Date.now() + (result.expires_in - 60) * 1000
                        };
                        localStorage.setItem('drive_token', JSON.stringify(updated));
                        return result.access_token;
                    }
                }
            }
        }
    } catch (e) {
        console.error('[DriveService] Web Auth retrieval failed:', e);
    }
    return null;
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

/** Set a folder to "Anyone with the link can view" */
async function makeFolderPublic(token: string, folderId: string): Promise<void> {
    try {
        await fetch(`${DRIVE_API}/${folderId}/permissions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                role: 'reader',
                type: 'anyone',
            }),
        });
        console.log(`[DriveService] Folder ${folderId} is now public (anyone with link)`);
    } catch (e) {
        console.warn('[DriveService] Failed to make folder public:', e);
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

/**
 * Upload a payment receipt PDF to Google Drive under the dealer's Receipts folder.
 */
export async function uploadReceiptPDF(
    base64Data: string,
    fileName: string,
    dealerName: string
): Promise<{ id: string; webViewLink: string }> {
    const token = await getDriveAccessToken();
    const folders = await getDealerFolders(token, dealerName);

    return uploadPdfToFolder(token, base64Data, fileName, folders.receipts);
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
 * Get or create the root "ERP Invoices" folder (shared with configured email).
 */
async function getErpInvoicesFolder(token: string): Promise<string> {
    if (cachedErpInvoicesFolderId) return cachedErpInvoicesFolderId;
    cachedErpInvoicesFolderId = await findOrCreateSubFolder(token, ERP_INVOICES_FOLDER, null);
    await shareFolderWithEmail(token, cachedErpInvoicesFolderId);
    return cachedErpInvoicesFolderId;
}

/** Month names for folder naming */
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Get or create the month subfolder inside ERP Invoices.
 * Folder name format: "February 2026", "March 2026", etc.
 * Uses the invoice date (not today) so backdated invoices land in the right month.
 */
async function getMonthFolderId(token: string, invoiceDate: Date): Promise<string> {
    const monthName = MONTH_NAMES[invoiceDate.getMonth()];
    const year = invoiceDate.getFullYear();
    const folderLabel = `${monthName} ${year}`; // e.g. "February 2026"

    if (monthFolderCache[folderLabel]) return monthFolderCache[folderLabel];

    const erpRoot = await getErpInvoicesFolder(token);
    const monthId = await findOrCreateSubFolder(token, folderLabel, erpRoot);
    monthFolderCache[folderLabel] = monthId;
    console.log(`[DriveService] Month folder '${folderLabel}':`, monthId);
    return monthId;
}

/**
 * Upload an invoice PDF to Google Drive organised by invoice month.
 * Structure: ERP Invoices / {Month YYYY} / filename.pdf
 *
 * Uses the user's OAuth token (personal Drive quota) instead of the service
 * account (which has no storage quota). Falls back with a clear error if the
 * user hasn't connected their Google Drive account yet.
 */
export async function uploadInvoicePDFByMonth(
    base64Data: string,
    fileName: string,
    invoiceDate: Date
): Promise<{ id: string; webViewLink: string }> {
    // Prefer user OAuth token (has storage quota) over service account
    const oauthToken = await getOAuthAccessToken();
    if (!oauthToken) {
        throw new Error(
            'Google Drive not connected. Please go to Settings → Connect Google Drive and sign in once.'
        );
    }
    const monthFolderId = await getMonthFolderId(oauthToken, invoiceDate);
    return uploadPdfToFolder(oauthToken, base64Data, fileName, monthFolderId);
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
/**
 * Upload a PDF specifically for sharing via WhatsApp.
 * Returns the webViewLink for the message.
 */
export async function uploadToWhatsAppFolder(
    base64Data: string,
    fileName: string
): Promise<string> {
    const oauthToken = await getOAuthAccessToken();
    if (!oauthToken) {
        throw new Error('Google Drive not connected. Please connect it in Settings to send PDF links.');
    }

    const rootId = await getRootFolder(oauthToken);
    const folderId = await findOrCreateSubFolder(oauthToken, WHATSAPP_UPLOADS_FOLDER, rootId);

    // Ensure the folder is public so links work for everyone
    await makeFolderPublic(oauthToken, folderId);

    const result = await uploadPdfToFolder(oauthToken, base64Data, fileName, folderId);
    return result.webViewLink;
}
