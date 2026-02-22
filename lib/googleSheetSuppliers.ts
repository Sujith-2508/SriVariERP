/**
 * Google Sheets Suppliers Service
 * 
 * Fetches "refined suppliers" from Google Sheets for the Purchase Management module.
 */

export interface HistoricalVoucher {
    supplierName: string;
    date: string;
    particulars: string;
    vchType: string;
    vchNo: string;
    debit: number;
    credit: number;
}

import { SupplierData } from '@/types';

const SPREADSHEET_ID = '1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0';
const SHEET_NAME = 'refined suppliers';
const SHEETS_API_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

// Service account credentials cache
let cachedToken: { token: string; expires: number } | null = null;

// Base64url encode
function base64url(str: string): string {
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Fetch with retry logic for handling transient API errors (like 503 Service Unavailable)
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);

            // Retry on 503, 502, 504, 500 or 429 (rate limit)
            if (response.ok || ![500, 502, 503, 504, 429].includes(response.status)) {
                return response;
            }

            console.warn(`[GoogleSheetSuppliers] Attempt ${i + 1} failed with status ${response.status}. Retrying...`);
        } catch (error) {
            lastError = error as Error;
            console.warn(`[GoogleSheetSuppliers] Attempt ${i + 1} failed with error: ${lastError.message}. Retrying...`);
        }

        // Wait with exponential backoff: 1s, 2s, 4s...
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // If we've exhausted retries, return the last call attempt (caller will handle !ok)
    if (lastError) throw lastError;
    return await fetch(url, options);
}

// Base64url encode from ArrayBuffer
function base64urlFromBuffer(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Convert PEM private key to CryptoKey
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

// Get OAuth2 access token using service account JWT
async function getAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expires) {
        return cachedToken.token;
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
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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

    const tokenResponse = await fetchWithRetry('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenResponse.ok) {
        throw new Error(`Failed to get access token: ${await tokenResponse.text()}`);
    }

    const tokenData = await tokenResponse.json();
    cachedToken = {
        token: tokenData.access_token,
        expires: Date.now() + (tokenData.expires_in - 60) * 1000,
    };

    return cachedToken.token;
}

// Fetch refined suppliers from Google Sheet
export async function fetchRefinedSuppliers(): Promise<SupplierData[]> {
    try {
        const token = await getAccessToken();
        const response = await fetchWithRetry(
            `${SHEETS_API_BASE}/values/${SHEET_NAME}!A:E`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!response.ok) {
            console.error('[GoogleSheetSuppliers] API error:', await response.text());
            return [];
        }

        const data = await response.json();
        const rows = data.values || [];
        if (rows.length <= 1) return [];

        // Skip header row
        const suppliers: SupplierData[] = rows.slice(1).map((row: any, index: number) => {
            const name = (row[0] || '').trim();
            const address = (row[1] || '').trim();
            const gst = (row[2] || '').trim();
            const phone = (row[3] || '').trim();

            return {
                id: `GS-${index + 1}`, // Temporary ID, will be matched/updated in purchaseService
                name,
                address,
                gstNumber: gst,
                phone,
                balance: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as SupplierData;
        });

        return suppliers;
    } catch (error) {
        console.error('[GoogleSheetSuppliers] Failed to fetch suppliers:', error);
        return [];
    }
}

// Fetch historical vouchers from Google Sheet
export async function fetchHistoricalVouchers(): Promise<HistoricalVoucher[]> {
    try {
        const token = await getAccessToken();
        const response = await fetch(
            `${SHEETS_API_BASE}/values/suppliers purchase bills and payments!A:G`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!response.ok) {
            console.error('[GoogleSheetSuppliers] API error:', await response.text());
            return [];
        }

        const data = await response.json();
        const rows = data.values || [];
        if (rows.length <= 1) return [];

        return rows.slice(1).map((row: any) => ({
            supplierName: (row[0] || '').trim(),
            date: (row[1] || '').trim(),
            particulars: (row[2] || '').trim(),
            vchType: (row[3] || '').trim(),
            vchNo: (row[4] || '').trim(),
            debit: parseFloat((row[5] || '0').replace(/,/g, '')) || 0,
            credit: parseFloat((row[6] || '0').replace(/,/g, '')) || 0,
        }));
    } catch (error) {
        console.error('[GoogleSheetSuppliers] Failed to fetch historical vouchers:', error);
        return [];
    }
}
