/**
 * Google Sheets Writer Service
 * 
 * Direct client-side Google Sheets API write operations using service account JWT auth.
 * Works with static Next.js export (no API routes needed).
 * 
 * Sheet structure (ProdData tab):
 * Column A: Product Name
 * Column B: Category
 * Column C: HSN Code
 * Column D: Unit
 * Column E: Cost Price
 * Column F: Selling Price
 * Column G: GST%
 * Column H: Stock
 */

import { Product } from '@/types';

const SPREADSHEET_ID = '1ksFhdJK6-sQxVBIkqqJdRKPhm--_SfzpJeuC2GHR2y0';
let SHEET_NAME = 'Updated Stock Items';
const SHEETS_API_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
// Column Layout: A:Name, D:Unit, E:Cost, F:Price, G:GST, H:Stock, I:Category
const HEADER_ROW = ['Product Name', '', '', 'Unit', 'Cost Price', 'Selling Price', 'GST%', 'Stock', 'Category'];

// Check if the "Updated Stock Items" tab exists, if not create it
async function ensureTabExists(): Promise<string> {
    try {
        const token = await getAccessToken();
        const response = await fetch(
            `${SHEETS_API_BASE}?fields=sheets.properties.title`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (response.ok) {
            const data = await response.json();
            const sheets = data.sheets || [];
            const sheetNames = sheets.map((s: any) => s.properties.title);

            if (!sheetNames.includes(SHEET_NAME)) {
                console.log(`[SheetsWriter] Creating missing tab: ${SHEET_NAME}`);
                await sheetsRequest(
                    ':batchUpdate',
                    'POST',
                    {
                        requests: [{
                            addSheet: {
                                properties: { title: SHEET_NAME }
                            }
                        }]
                    }
                );
                // Add headers to the new sheet
                await sheetsRequest(
                    `/values/${SHEET_NAME}!A1:I1?valueInputOption=USER_ENTERED`,
                    'PUT',
                    { values: [HEADER_ROW] }
                );
            }
        }
    } catch (e) {
        console.error('[SheetsWriter] Failed to ensure tab exists:', e);
    }
    return SHEET_NAME;
}

// Resolver for backward compatibility or dynamic needs
async function getSheetName(): Promise<string> {
    await ensureTabExists();
    return SHEET_NAME;
}

// Find a row index by product name in Column A
async function findRowByName(name: string): Promise<number> {
    try {
        const sheetName = await getSheetName();
        const data = await sheetsRequest(`/values/${sheetName}!A:A`);
        const rows = data.values || [];

        // Skip potential top headers, find the exact match
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0]?.trim() === name.trim()) {
                return i + 1; // Return 1-indexed row number
            }
        }
        return -1;
    } catch (e) {
        console.error('[SheetsWriter] Failed to find row by name:', e);
        return -1;
    }
}

// Service account credentials from env
let cachedToken: { token: string; expires: number } | null = null;

// Base64url encode
function base64url(str: string): string {
    const b64 = btoa(str);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    // Remove PEM header/footer and whitespace
    const pemContents = pem
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\\n/g, '')
        .replace(/\n/g, '')
        .replace(/\s/g, '');

    // Decode base64 to ArrayBuffer
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
    // Return cached token if still valid
    if (cachedToken && Date.now() < cachedToken.expires) {
        return cachedToken.token;
    }

    const serviceAccountKey = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY is not set');
    }

    const credentials = JSON.parse(serviceAccountKey);
    const now = Math.floor(Date.now() / 1000);

    // Create JWT header
    const header = base64url(JSON.stringify({
        alg: 'RS256',
        typ: 'JWT',
    }));

    // Create JWT claim set
    const claims = base64url(JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    }));

    const signInput = `${header}.${claims}`;

    // Sign with private key
    const privateKey = await importPrivateKey(credentials.private_key);
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        privateKey,
        new TextEncoder().encode(signInput)
    );

    const jwt = `${signInput}.${base64urlFromBuffer(signature)}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenResponse.ok) {
        const err = await tokenResponse.text();
        throw new Error(`Failed to get access token: ${err}`);
    }

    const tokenData = await tokenResponse.json();
    cachedToken = {
        token: tokenData.access_token,
        expires: Date.now() + (tokenData.expires_in - 60) * 1000, // Refresh 60s before expiry
    };

    console.log('[SheetsWriter] Got access token, expires in', tokenData.expires_in, 'seconds');
    return cachedToken.token;
}

// Make authenticated request to Sheets API
async function sheetsRequest(path: string, method: string = 'GET', body?: any): Promise<any> {
    const token = await getAccessToken();
    const url = `${SHEETS_API_BASE}${path}`;

    const options: RequestInit = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        const err = await response.text();
        console.error('[SheetsWriter] API error:', response.status, err);
        throw new Error(`Sheets API error (${response.status}): ${err}`);
    }

    return response.json();
}

// Convert product to sheet row values (Dedicated ERP layout)
function productToRow(product: Product | any): string[] {
    // GST should be written as a whole number (e.g., 5 instead of 0.05)
    // If it's a decimal like 0.05, convert it to 5
    let gstValue = parseFloat(product.gstRate || 0);
    if (gstValue > 0 && gstValue < 1) {
        gstValue = gstValue * 100;
    }

    const row = [];
    row[0] = product.name || ''; // Column A
    row[1] = product.productId || ''; // Column B (Product ID)
    row[2] = product.hsnCode || ''; // Column C (HSN Code)
    row[3] = product.unit || 'nos'; // Column D
    row[4] = String(product.costPrice || 0); // Column E
    row[5] = String(product.price || 0); // Column F
    row[6] = String(gstValue); // Column G
    row[7] = String(product.stock || 0); // Column H
    row[8] = product.category || 'General'; // Column I

    return row;
}

// Add a new product (Search for existing name first, then update or append)
export async function addProductToSheet(product: Product | any): Promise<boolean> {
    try {
        const existingRowIndex = await findRowByName(product.name);
        const sheetName = await getSheetName();

        if (existingRowIndex > 0) {
            console.log('[SheetsWriter] Product already exists, updating row', existingRowIndex);
            return await updateProductInSheet(existingRowIndex, product);
        }

        await sheetsRequest(
            `/values/${sheetName}!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST',
            { values: [productToRow(product)] }
        );

        console.log('[SheetsWriter] Product added to sheet:', product.name);
        return true;
    } catch (error: any) {
        console.error('[SheetsWriter] Failed to add product:', error.message);
        return false;
    }
}

// Update an existing product (update specific row or search by name)
export async function updateProductInSheet(rowIndex: number, product: Product | any): Promise<boolean> {
    try {
        let finalRowIndex = rowIndex;

        // If rowIndex is not provided or invalid, search by name
        if (!finalRowIndex || finalRowIndex <= 0) {
            finalRowIndex = await findRowByName(product.name);
        }

        if (finalRowIndex <= 0) {
            console.warn('[SheetsWriter] Could not find row for product:', product.name);
            return await addProductToSheet(product);
        }

        const sheetName = await getSheetName();
        await sheetsRequest(
            `/values/${sheetName}!A${finalRowIndex}:I${finalRowIndex}?valueInputOption=USER_ENTERED`,
            'PUT',
            { values: [productToRow(product)] }
        );

        console.log('[SheetsWriter] Product updated in sheet at row', finalRowIndex, ':', product.name);
        return true;
    } catch (error: any) {
        console.error('[SheetsWriter] Failed to update product:', error.message);
        return false;
    }
}

// Delete a product (clear the row, search by name if rowIndex missing)
export async function deleteProductFromSheet(rowIndex: number, productName?: string): Promise<boolean> {
    try {
        let finalRowIndex = rowIndex;
        if (!finalRowIndex || finalRowIndex <= 0) {
            if (!productName) {
                console.error('[SheetsWriter] Cannot delete: Missing rowIndex and product name');
                return false;
            }
            finalRowIndex = await findRowByName(productName);
        }

        if (finalRowIndex <= 0) {
            console.warn('[SheetsWriter] Could not find row to delete:', productName);
            return true; // Already gone or not found
        }

        const sheetName = await getSheetName();
        await sheetsRequest(
            `/values/${sheetName}!A${finalRowIndex}:I${finalRowIndex}?valueInputOption=USER_ENTERED`,
            'PUT',
            { values: [['', '', '', '', '', '', '', '', '']] }
        );

        console.log('[SheetsWriter] Product deleted from sheet at row', finalRowIndex);
        return true;
    } catch (error: any) {
        console.error('[SheetsWriter] Failed to delete product:', error.message);
        return false;
    }
}

// Read all products via Sheets API (more reliable than CSV for structured data)
export async function readProductsFromSheet(): Promise<{ products: Product[]; format: string }> {
    try {
        const sheetName = await getSheetName();
        const data = await sheetsRequest(`/values/${sheetName}!A:I`);
        const rows = data.values || [];

        if (rows.length < 2) {
            return { products: [], format: 'empty' };
        }

        // Find header row (usually index 0 in the clean tab)
        let headerIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
            const row = rows[i].map((c: string) => c?.toLowerCase().trim() || '');
            if (row.some((c: string) => c.includes('product name'))) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex === -1) headerIndex = 0;

        const products: Product[] = [];
        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const name = row[0]?.trim();
            if (!name) continue;

            // Updated Mapping: A:Name, D:Unit, E:Cost, f:Price, G:GST, H:Stock, I:Category
            products.push({
                id: `P${String(i - headerIndex).padStart(3, '0')}`,
                productId: `P${String(i - headerIndex).padStart(3, '0')}`,
                name: name,
                category: row[8]?.trim() || row[1]?.trim() || 'General',
                hsnCode: row[2]?.trim() || '',
                unit: row[3]?.trim() || 'nos',
                costPrice: parseFloat(row[4]) || 0,
                price: parseFloat(row[5]) || 0,
                gstRate: parseFloat(row[6]) || 0,
                stock: parseInt(row[7]) || 0,
                rowIndex: i + 1,
            } as Product & { rowIndex: number });
        }

        return { products, format: 'structured' };
    } catch (error: any) {
        console.error('[SheetsWriter] Failed to read products:', error.message);
        throw error;
    }
}

// Test connection to Google Sheets
export async function testSheetConnection(): Promise<{ success: boolean; message: string }> {
    try {
        const sheetName = await getSheetName();
        const data = await sheetsRequest(`/values/${sheetName}!A1:A1`);
        return { success: true, message: `Connected! First cell: ${data.values?.[0]?.[0] || '(empty)'}` };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

/**
 * Append multiple rows to a specific sheet
 */
export async function appendRowsToSheet(sheetName: string, rows: any[][]): Promise<boolean> {
    try {
        // Ensure tab exists first
        await ensureTabExistsWithName(sheetName);

        await sheetsRequest(
            `/values/${sheetName}!A:Z:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST',
            { values: rows }
        );
        return true;
    } catch (error: any) {
        console.error(`[SheetsWriter] Failed to append rows to ${sheetName}:`, error.message);
        return false;
    }
}

/**
 * Sync a new or updated Invoice to the "ERP Invoices" sheet
 */
export async function syncInvoiceToSheets(dealerName: string, invoiceId: string, amount: number, date: string, items: any[]): Promise<boolean> {
    const timestamp = new Date().toISOString();
    const rows = [[
        timestamp,
        dealerName,
        invoiceId,
        date,
        String(amount),
        JSON.stringify(items.map(i => `${i.productName} (x${i.quantity})`))
    ]];
    return await appendRowsToSheet('ERP Invoices', rows);
}

/**
 * Sync a new Payment to the "ERP Payments" sheet
 */
export async function syncPaymentToSheets(dealerName: string, receiptId: string, amount: number, method: string, agent: string): Promise<boolean> {
    const timestamp = new Date().toISOString();
    const rows = [[
        timestamp,
        dealerName,
        receiptId,
        String(amount),
        method,
        agent
    ]];
    return await appendRowsToSheet('ERP Payments', rows);
}

/**
 * Find a row index by searching for a value in a specific column index (0-based)
 */
export async function findRowByValue(sheetName: string, columnIndex: number, value: string): Promise<number> {
    try {
        await ensureTabExistsWithName(sheetName);
        const colLetter = String.fromCharCode(65 + columnIndex);
        const data = await sheetsRequest(`/values/${sheetName}!${colLetter}:${colLetter}`);
        const rows = data.values || [];

        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0]?.trim() === value?.trim()) {
                return i + 1; // 1-indexed
            }
        }
        return -1;
    } catch (e) {
        console.error(`[SheetsWriter] Failed to find row in ${sheetName}:`, e);
        return -1;
    }
}

/**
 * Update a specific row in a sheet
 */
export async function updateRowInSheet(sheetName: string, rowIndex: number, rowData: any[]): Promise<boolean> {
    try {
        await ensureTabExistsWithName(sheetName);
        await sheetsRequest(
            `/values/${sheetName}!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`,
            'PUT',
            { values: [rowData] }
        );
        return true;
    } catch (error: any) {
        console.error(`[SheetsWriter] Failed to update row ${rowIndex} in ${sheetName}:`, error.message);
        return false;
    }
}

/**
 * Clear a row (deletion)
 */
export async function clearRowInSheet(sheetName: string, rowIndex: number, columnCount: number = 10): Promise<boolean> {
    try {
        const lastColLetter = String.fromCharCode(64 + columnCount);
        const emptyRow = Array(columnCount).fill('');

        await sheetsRequest(
            `/values/${sheetName}!A${rowIndex}:${lastColLetter}${rowIndex}?valueInputOption=USER_ENTERED`,
            'PUT',
            { values: [emptyRow] }
        );
        return true;
    } catch (error: any) {
        console.error(`[SheetsWriter] Failed to clear row ${rowIndex} in ${sheetName}:`, error.message);
        return false;
    }
}

/**
 * Ensure a specific tab exists by name
 */
export async function ensureTabExistsWithName(name: string): Promise<void> {
    try {
        const token = await getAccessToken();
        const response = await fetch(
            `${SHEETS_API_BASE}?fields=sheets.properties.title`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (response.ok) {
            const data = await response.json();
            const sheets = data.sheets || [];
            const sheetNames = sheets.map((s: any) => s.properties.title);

            if (!sheetNames.includes(name)) {
                console.log(`[SheetsWriter] Creating tab: ${name}`);
                await sheetsRequest(
                    ':batchUpdate',
                    'POST',
                    {
                        requests: [{
                            addSheet: {
                                properties: { title: name }
                            }
                        }]
                    }
                );
            }
        }
    } catch (e) {
        console.error(`[SheetsWriter] Failed to ensure tab ${name} exists:`, e);
    }
}
