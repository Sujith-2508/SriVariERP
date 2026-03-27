/**
 * Google Sheets Writer Service
 * 
 * Direct client-side Google Sheets API write operations using service account JWT auth.
 * Works with static Next.js export (no API routes needed).
 * 
 * Sheet structure (CurrentProducts tab):
 * Column A: Product Name
 * Column B: HSN Code
 * Column C: Unit
 * Column D: Cost Price
 * Column E: Selling Price
 * Column F: GST%
 * Column G: Stock
 * Column H: Category
 */

import { Product } from '@/types';

const SPREADSHEET_ID = '1ksFhdJK6-sQxVBIkqqJdRKPhm--_SfzpJeuC2GHR2y0';
const LOG_SPREADSHEET_ID = '1O5Rjp2iA4dvq7rQog2-al5wDdn3xpjAm3KAFgX3AQ9U';
let SHEET_NAME = 'CurrentProducts';
const SHEETS_API_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const LOG_API_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${LOG_SPREADSHEET_ID}`;
// Column Layout: A:Product ID, B:Name, C:HSN Code, D:Unit, E:Cost Price, F:Selling Price, G:GST%, H:Stock, I:Category
const HEADER_ROW = ['Product ID', 'Product Name', 'HSN Code', 'Unit', 'Cost Price', 'Selling Price', 'GST%', 'Stock', 'Category'];

// Check if the "CurrentProducts" tab exists, if not create it
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
                const headerRange = `${SHEET_NAME}!A1:I1`;
                await sheetsRequest(
                    `/values/${headerRange}?valueInputOption=USER_ENTERED`,
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

// Return the sheet name directly — "Current Products" tab already exists
async function getSheetName(): Promise<string> {
    return SHEET_NAME;
}

// Find a row index by product name in Column B (1-indexed, since A=Product ID now)
async function findRowByName(name: string): Promise<number> {
    try {
        const sheetName = await getSheetName();
        const data = await sheetsRequest(`/values/${sheetName}!B:B`);
        const rows = data.values || [];

        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0]?.trim().toLowerCase() === name.trim().toLowerCase()) {
                return i + 1; // Return 1-indexed row number
            }
        }
        return -1;
    } catch (e) {
        console.error('[SheetsWriter] Failed to find row by name:', e);
        return -1;
    }
}

// Get the sheet's numeric ID (needed for row deletion)
async function getSheetId(): Promise<number> {
    const token = await getAccessToken();
    const response = await fetch(
        `${SHEETS_API_BASE}?fields=sheets.properties`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error('Could not fetch sheet properties');
    const data = await response.json();
    const sheet = (data.sheets || []).find((s: any) => s.properties.title === SHEET_NAME);
    if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);
    return sheet.properties.sheetId;
}

// Find the last row index (1-indexed) belonging to a given category
// Looks at column I (index 8 → 0-based col 8) for the category value
async function findLastRowOfCategory(category: string): Promise<number> {
    try {
        const sheetName = await getSheetName();
        const data = await sheetsRequest(`/values/${sheetName}!A:I`);
        const rows: string[][] = data.values || [];

        let lastMatchRow = -1;
        for (let i = 0; i < rows.length; i++) {
            const rowCategory = rows[i][8]?.trim().toLowerCase() || '';
            if (rowCategory === category.trim().toLowerCase()) {
                lastMatchRow = i + 1; // 1-indexed
            }
        }
        return lastMatchRow;
    } catch (e) {
        console.error('[SheetsWriter] Failed to find last row of category:', e);
        return -1;
    }
}

// Service account credentials from env
let cachedToken: { token: string; expires: number } | null = null;

// Base64url encode
function base64url(str: string): string {
    const b64 = btoa(unescape(encodeURIComponent(str)));
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

    let tokenData;

    // Use Electron bridge if available (avoids CORS issues for Service Account Token Fetch)
    if (typeof window !== 'undefined' && (window as any).electron?.drive?.getServiceToken) {
        console.log('[SheetsWriter] Using Electron bridge for token fetch...');
        tokenData = await (window as any).electron.drive.getServiceToken(credentials);
    } else {
        // Fallback to direct fetch (only works if CORS is disabled or via proxy)
        console.log('[SheetsWriter] Using direct fetch for token (may fail in browser due to CORS)...');
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

        tokenData = await tokenResponse.json();
    }

    cachedToken = {
        token: tokenData.access_token,
        expires: Date.now() + (tokenData.expires_in - 60) * 1000, // Refresh 60s before expiry
    };

    console.log('[SheetsWriter] Got access token, expires in', tokenData.expires_in, 'seconds');
    return cachedToken.token;
}

// Make authenticated request to Sheets API
async function sheetsRequest(path: string, method: string = 'GET', body?: any, isLog: boolean = false): Promise<any> {
    const token = await getAccessToken();
    const apiBase = isLog ? LOG_API_BASE : SHEETS_API_BASE;
    const url = `${apiBase}${path}`;

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

// Convert product to sheet row — matches CurrentProducts tab 9-column layout:
// A:Product ID, B:Name, C:HSN Code, D:Unit, E:Cost Price, F:Selling Price, G:GST%, H:Stock, I:Category
function productToRow(product: Product | any): string[] {
    // GST stored as decimal (0.05) → write as whole number (5)
    let gstValue = parseFloat(product.gstRate || 0);
    if (gstValue > 0 && gstValue < 1) gstValue = gstValue * 100;

    return [
        product.productId || product.id || '',  // A: Product ID
        product.name || '',                     // B: Product Name
        product.hsnCode || '',                  // C: HSN Code
        product.unit || 'nos',                  // D: Unit
        String(product.costPrice || 0),         // E: Cost Price
        String(product.price || 0),             // F: Selling Price
        String(gstValue),                       // G: GST%
        String(product.stock || 0),             // H: Stock
        product.category || 'General',          // I: Category
    ];
}

// Add a new product, inserting after the last row of its category for grouping
export async function addProductToSheet(product: Product | any): Promise<boolean> {
    try {
        // If the product already exists, update it instead
        const existingRowIndex = await findRowByName(product.name);
        if (existingRowIndex > 0) {
            console.log('[SheetsWriter] Product already exists, updating row', existingRowIndex);
            return await updateProductInSheet(existingRowIndex, product);
        }

        const sheetName = await getSheetName();
        const row = productToRow(product);

        // Try to insert after the last product of the same category
        const lastCategoryRow = product.category
            ? await findLastRowOfCategory(product.category)
            : -1;

        if (lastCategoryRow > 0) {
            // Insert a new row after the last product in this category using batchUpdate
            const sheetId = await getSheetId();
            // Insert blank row after lastCategoryRow (0-indexed: lastCategoryRow)
            await sheetsRequest(':batchUpdate', 'POST', {
                requests: [{
                    insertDimension: {
                        range: {
                            sheetId,
                            dimension: 'ROWS',
                            startIndex: lastCategoryRow,   // 0-indexed (insert after 1-indexed row)
                            endIndex: lastCategoryRow + 1,
                        },
                        inheritFromBefore: true,
                    }
                }]
            });
            // Write product data to the newly inserted row
            const newRow = lastCategoryRow + 1; // 1-indexed
            await sheetsRequest(
                `/values/${sheetName}!A${newRow}:I${newRow}?valueInputOption=USER_ENTERED`,
                'PUT',
                { values: [row] }
            );
            console.log('[SheetsWriter] Product added under category', product.category, 'at row', newRow);
        } else {
            // Category not found or no category – append at the end
            await sheetsRequest(
                `/values/${sheetName}!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
                'POST',
                { values: [row] }
            );
            console.log('[SheetsWriter] Product appended (category not found):', product.name);
        }

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

// Delete a product by physically removing its row from the sheet
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

        // Get the numeric sheet ID (needed for batchUpdate deleteDimension)
        const sheetId = await getSheetId();

        // Use deleteDimension to physically remove the row (0-indexed range)
        await sheetsRequest(':batchUpdate', 'POST', {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId,
                        dimension: 'ROWS',
                        startIndex: finalRowIndex - 1,  // 0-indexed
                        endIndex: finalRowIndex,         // exclusive
                    }
                }
            }]
        });

        console.log('[SheetsWriter] Product row deleted from sheet:', productName, '(row', finalRowIndex, ')');
        return true;
    } catch (error: any) {
        console.error('[SheetsWriter] Failed to delete product:', error.message);
        return false;
    }
}

// Read all products via Sheets API — matches CurrentProducts tab layout:
// A=Product ID, B=Product Name, C=HSN Code, D=Unit, E=Cost Price, F=Selling Price, G=GST%, H=Stock, I=Category
export async function readProductsFromSheet(): Promise<{ products: Product[]; format: string }> {
    try {
        const sheetName = await getSheetName();
        const data = await sheetsRequest(`/values/${sheetName}!A:I`);  // include all 9 columns
        const rows: string[][] = data.values || [];

        if (rows.length < 2) {
            return { products: [], format: 'empty' };
        }

        // Find header row: the first row containing "product name" or "product id"
        let headerIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
            const lower = rows[i].map((c: string) => (c || '').toLowerCase().trim());
            if (lower.some((c: string) => c.includes('product name') || c.includes('product id'))) {
                headerIndex = i;
                break;
            }
        }
        if (headerIndex === -1) headerIndex = 0;

        // Build column index map from header row names
        // New layout: A=Product ID(0), B=Name(1), C=HSN(2), D=Unit(3),
        //             E=Cost Price(4), F=Selling Price(5), G=GST%(6), H=Stock(7), I=Category(8)
        const headers = (rows[headerIndex] || []).map((c: string) => (c || '').toLowerCase().trim());
        const col = {
            productId: headers.findIndex((h: string) => h.includes('product id')),
            name: headers.findIndex((h: string) => h.includes('product name') || h === 'name'),
            hsn: headers.findIndex((h: string) => h.includes('hsn')),
            unit: headers.findIndex((h: string) => h === 'unit'),
            cost: headers.findIndex((h: string) => h.includes('cost')),
            price: headers.findIndex((h: string) => h.includes('selling')),  // 'selling price' only
            gst: headers.findIndex((h: string) => h.includes('gst')),
            stock: headers.findIndex((h: string) => h === 'stock'),
            category: headers.findIndex((h: string) => h.includes('category')),
        };

        console.log('[SheetsWriter] Column map:', col);

        const parseNum = (val: string) => parseFloat((val || '').replace(/,/g, '')) || 0;

        const products: Product[] = [];
        let productNum = 1;

        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const name = col.name >= 0 ? (row[col.name] || '').trim() : '';
            if (!name) continue;

            // Skip category section header rows (only one cell has content, rest empty)
            const hasData = (col.unit >= 0 && (row[col.unit] || '').trim())
                || (col.price >= 0 && (row[col.price] || '').trim())
                || (col.category >= 0 && (row[col.category] || '').trim());
            if (!hasData) {
                console.log('[SheetsWriter] Skipping section header:', name);
                continue;
            }

            const sheetProductId = col.productId >= 0 ? (row[col.productId] || '').trim() : '';
            const productId = sheetProductId || `P${String(productNum).padStart(3, '0')}`;

            const rawGst = col.gst >= 0 ? parseNum(row[col.gst]) : 0;
            // Normalize GST: whole number (e.g. 5) stays as-is; decimal (0.05) → 5
            const gstRate = rawGst > 0 && rawGst < 1 ? rawGst * 100 : rawGst;

            products.push({
                id: productId,
                productId,
                name,
                category: col.category >= 0 ? (row[col.category] || '').trim() || 'General' : 'General',
                unit: col.unit >= 0 ? (row[col.unit] || '').trim() || 'nos' : 'nos',
                hsnCode: col.hsn >= 0 ? (row[col.hsn] || '').trim() : '',
                costPrice: col.cost >= 0 ? parseNum(row[col.cost]) : 0,
                price: col.price >= 0 ? parseNum(row[col.price]) : 0,
                gstRate,
                stock: col.stock >= 0 ? parseInt((row[col.stock] || '').replace(/,/g, '')) || 0 : 0,
                rowIndex: i + 1,
            } as Product & { rowIndex: number });

            productNum++;
        }

        console.log('[SheetsWriter] Loaded', products.length, 'products from', sheetName);
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
export async function appendRowsToSheet(sheetName: string, rows: any[][], isLog: boolean = false): Promise<boolean> {
    try {
        // Ensure tab exists first
        await ensureTabExistsWithName(sheetName, undefined, isLog);

        await sheetsRequest(
            `/values/${sheetName}!A:Z:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST',
            { values: rows },
            isLog
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
export async function ensureTabExistsWithName(name: string, headerRow?: string[], isLog: boolean = false): Promise<void> {
    try {
        const token = await getAccessToken();
        const apiBase = isLog ? LOG_API_BASE : SHEETS_API_BASE;
        const response = await fetch(
            `${apiBase}?fields=sheets.properties.title`,
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
                    },
                    isLog
                );

                if (headerRow) {
                    const lastColLetter = String.fromCharCode(64 + headerRow.length);
                    await sheetsRequest(
                        `/values/${name}!A1:${lastColLetter}1?valueInputOption=USER_ENTERED`,
                        'PUT',
                        { values: [headerRow] },
                        isLog
                    );
                }
            }
        }
    } catch (e) {
        console.error(`[SheetsWriter] Failed to ensure tab ${name} exists:`, e);
    }
}

/**
 * Log an action to the "Application Log" sheet
 */
export async function logToApplicationSheet(action: string, details: string, amount: number = 0): Promise<boolean> {
    try {
        const LOG_SHEET_NAME = 'Application Log';
        const LOG_HEADERS = ['Date', 'Time', 'Platform', 'Action', 'Details', 'Amount'];
        
        await ensureTabExistsWithName(LOG_SHEET_NAME, LOG_HEADERS, true);

        const now = new Date();
        const date = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
        const time = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

        // Platform detection
        let platform = 'WEB';
        if (typeof window !== 'undefined') {
            if ((window as any).electron) platform = 'DESKTOP';
            else if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) platform = 'MOBILE';
        }

        const row = [
            date,
            time,
            platform,
            action,
            details,
            amount === 0 ? '' : String(amount)
        ];

        return await appendRowsToSheet(LOG_SHEET_NAME, [row], true);
    } catch (error: any) {
        console.error('[SheetsWriter] Failed to log to application sheet:', error.message);
        return false;
    }
}
