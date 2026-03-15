/**
 * Google Sheets Dealers Service
 * 
 * Synchronized structure for Dealer data between Supabase and Google Sheets.
 * Spreadsheet ID: 1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0
 */

import { Dealer } from '@/types';

const SPREADSHEET_ID = '1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0';
export const DEALERS_SHEET_NAME = 'Dealers'; // The structured sync tab

export const DEALER_HEADERS = [
    'Business Name',    // A
    'Contact Person',   // B
    'Phone',            // C
    'City',             // D
    'District',         // E
    'State',            // F
    'Pin Code',         // G
    'GST Number',       // H
    'Address',          // I
    'Balance',          // J
    'Supabase ID'       // K (Key for syncing)
];

const INDIVIDUAL_LEDGER_HEADERS = [
    'Date',             // A
    'Particulars',      // B
    'Invoice No.',      // C
    'Receipt No.',      // D
    'Vch Type',         // E
    'Sales (Cr \u20B9)',  // F
    'Receipts (Dr \u20B9)',// G
    'Balance (\u20B9)',   // H
    'Type'              // I
];

// Service account credentials cache
let cachedToken: { token: string; expires: number } | null = null;
const SHEETS_API_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

// Helper: base64url encode
function base64url(str: string): string {
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sanitizes and truncates a string for use as a Google Sheets tab name.
 * Tab names:
 * 1. Must be <= 31 characters.
 * 2. Cannot contain: : \ / ? * [ ]
 * 3. Cannot start or end with a single quote.
 */
export function sanitizeTabName(name: string): string {
    if (!name) return 'Untitled';
    let sanitized = name
        .replace(/[:\\/?*\[\]]/g, ' ') // Replace invalid sheets chars with space
        .replace(/'/g, '')             // Remove single quotes
        .replace(/[^\w\s\.\,&-]/g, '') // Remove other special characters (keep words, spaces, dots, commas, ampersands, hyphens)
        .replace(/\s+/g, ' ')          // Collapse multiple spaces
        .trim();

    // Truncate to 31 characters
    if (sanitized.length > 31) {
        sanitized = sanitized.substring(0, 31).trim();
    }

    const finalName = sanitized || 'Untitled';
    console.log(`[SheetsDealers] Sanitized tab name: "${name}" -> "${finalName}"`);
    return finalName;
}

// Auth: Get access token
async function getAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;
    const serviceAccountKey = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY is not set');
    const credentials = JSON.parse(serviceAccountKey);
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    }));
    const signInput = `${header}.${claims}`;
    const pemContents = credentials.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\\n/g, '').replace(/\n/g, '').replace(/\s/g, '');
    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const privateKey = await crypto.subtle.importKey(
        'pkcs8', bytes.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signInput));
    const signatureBytes = new Uint8Array(signature);
    let binary = '';
    for (let i = 0; i < signatureBytes.length; i++) binary += String.fromCharCode(signatureBytes[i]);
    const signatureB64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const jwt = `${signInput}.${signatureB64}`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenResponse.json();
    cachedToken = { token: tokenData.access_token, expires: Date.now() + (tokenData.expires_in - 60) * 1000 };
    return cachedToken.token;
}

// Request: Generic Sheets API caller
async function sheetsRequest(path: string, method: string = 'GET', body?: any): Promise<any> {
    const token = await getAccessToken();
    const url = `${SHEETS_API_BASE}${path}`;
    const options: RequestInit = {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Sheets API error: ${await response.text()}`);
    return response.json();
}

/**
 * Transforms a Dealer object into a sheet row array (11 columns)
 */
function dealerToRow(dealer: Dealer): any[] {
    return [
        dealer.businessName,
        dealer.contactPerson || '',
        dealer.phone,
        dealer.city || '',
        dealer.district || '',
        dealer.state || '',
        dealer.pinCode || '',
        dealer.gstNumber || '',
        dealer.address || '',
        dealer.balance || 0,
        dealer.id
    ];
}

export async function syncDealerToSheet(dealer: Dealer, companyInfo?: any): Promise<boolean> {
    const name = sanitizeTabName(dealer.businessName);
    console.log(`[SheetsDealers] Starting sync for dealer: ${dealer.businessName} (sanitized: ${name})`);
    try {
        // 1. Ensure master index is updated
        const rowIndex = await findRowByValue(10, dealer.id);
        const rowData = dealerToRow(dealer);

        if (rowIndex > 0) {
            console.log(`[SheetsDealers] Updating Index row ${rowIndex} for: ${dealer.businessName}`);
            await sheetsRequest(`/values/${DEALERS_SHEET_NAME}!A${rowIndex}:K${rowIndex}?valueInputOption=USER_ENTERED`, 'PUT', { values: [rowData] });
        } else {
            console.log(`[SheetsDealers] Adding to Index: ${dealer.businessName}`);
            await ensureIndexTabExists();
            // Use A:A to force it to look for the next free row starting from Column A
            await sheetsRequest(`/values/${DEALERS_SHEET_NAME}!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, 'POST', { values: [rowData] });
        }

        // 2. Initialize the PROFESSIONAL LEDGER Sheet for this dealer
        console.log(`[SheetsDealers] Initializing ledger for: "${dealer.businessName}" (Sanitized: "${name}")`);
        await initializeDealerLedger(dealer, companyInfo);

        console.log(`[SheetsDealers] Sync complete for member of "${dealer.businessName}"`);
        return true;
    } catch (e) {
        console.error(`[SheetsDealers] Sync fail for ${dealer.businessName}:`, e);
        return false;
    }
}

/**
 * Creates a professional Tally-style header for a dealer's ledger
 */
export async function initializeDealerLedger(dealer: Dealer, companyInfo: any): Promise<void> {
    if (!dealer || !dealer.businessName) {
        console.error('[SheetsDealers] Cannot initialize ledger: Invalid dealer data', dealer);
        return;
    }
    const name = sanitizeTabName(dealer.businessName);
    console.log(`[SheetsDealers] Initializing ledger for ${dealer.businessName} (Tab: ${name})`);
    try {
        const res = await sheetsRequest('?fields=sheets.properties.title,sheets.properties.sheetId');
        const sheet = (res.sheets || []).find((s: any) => s.properties.title === name);

        if (!sheet) {
            console.log(`[SheetsDealers] Tab "${name}" missing. Creating professional tab for "${dealer.businessName}"...`);
            const newSheetRes = await sheetsRequest(':batchUpdate', 'POST', {
                requests: [{ addSheet: { properties: { title: name } } }]
            });
            const sheetId = newSheetRes.replies[0].addSheet.properties.sheetId;
            console.log(`[SheetsDealers] Created new sheet with ID: ${sheetId} for tab: "${name}"`);

            // Prepare Header Rows (1-10)
            const rows = [
                [companyInfo?.companyName || 'SRI VARI ENTERPRISES', '', '', '', '', '', '', '', ''], // 1
                [companyInfo?.addressLine1 || '', '', '', '', '', '', '', '', ''], // 2
                [`GST IN: ${companyInfo?.gstNumber || ''} | MOB: ${companyInfo?.phone || ''} | Email: ${companyInfo?.email || ''}`, '', '', '', '', '', '', '', ''], // 3
                ['', '', '', '', '', '', '', '', ''], // 4
                [`${dealer.businessName} - Ledger Account`, '', '', '', '', '', '', '', ''], // 5
                [`${dealer.address || ''} | CELL: ${dealer.phone} | GST: ${dealer.gstNumber || ''}`, '', '', '', '', '', '', '', ''], // 6
                [`Period: 01 Apr 2019 To ${new Date().toLocaleDateString('en-IN')}`, '', '', '', '', '', '', '', ''], // 7
                ['', '', '', '', '', '', '', '', ''], // 8
                INDIVIDUAL_LEDGER_HEADERS, // 9
                ['', 'Opening Balance', '', '', '', '0', '0', String(dealer.openingBalance || 0), ''] // 10
            ];

            await sheetsRequest(`/values/'${name}'!A1:I10?valueInputOption=USER_ENTERED`, 'PUT', { values: rows });

            // Apply Professional Formatting (Colors, Merging, Alignment)
            await sheetsRequest(':batchUpdate', 'POST', {
                requests: [
                    { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
                    { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
                    { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
                    { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
                    { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },

                    {
                        repeatCell: {
                            range: { sheetId, startRowIndex: 8, endRowIndex: 9 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.1, green: 0.2, blue: 0.4 },
                                    textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                                    horizontalAlignment: 'CENTER'
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId, startRowIndex: 9, endRowIndex: 10 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.9, green: 0.95, blue: 0.9 },
                                    textFormat: { bold: true }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat)'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                            cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } },
                            fields: 'userEnteredFormat(textFormat)'
                        }
                    },
                    // NEW: Force Date Formatting for Column A (Index 0)
                    {
                        repeatCell: {
                            range: { sheetId, startRowIndex: 8, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 1 },
                            cell: {
                                userEnteredFormat: {
                                    numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' },
                                    horizontalAlignment: 'LEFT'
                                }
                            },
                            fields: 'userEnteredFormat(numberFormat,horizontalAlignment)'
                        }
                    }
                ]
            });
        }
    } catch (e) {
        console.error(`[SheetsDealers] Failed to initialize professional ledger for ${name}:`, e);
    }
}

/**
 * Specifically deletes a dealer's individual sheet tab
 */
export async function deleteDealerSheet(sheetName: string): Promise<boolean> {
    const name = sanitizeTabName(sheetName);
    try {
        const res = await sheetsRequest('?fields=sheets.properties.title,sheets.properties.sheetId');
        const sheet = (res.sheets || []).find((s: any) => s.properties.title === name);

        if (sheet) {
            const sheetId = sheet.properties.sheetId;
            await sheetsRequest(':batchUpdate', 'POST', {
                requests: [{
                    deleteSheet: { sheetId }
                }]
            });
            console.log(`[SheetsDealers] Deleted tab: ${sheetName}`);
            return true;
        }
        return false;
    } catch (e) {
        console.error(`[SheetsDealers] Failed to delete sheet ${sheetName}:`, e);
        return false;
    }
}

/**
 * Appends a transaction to the dealer's individual ledger sheet
 */
export async function syncTransactionToDealerSheet(dealerName: string, transaction: any, runningBalance: number): Promise<boolean> {
    const name = sanitizeTabName(dealerName);
    try {
        const isInvoice = transaction.type === 'INVOICE';

        // Smart Particulars Construction
        const isCheckReturn = transaction.notes?.startsWith('Cheque Return') ||
            transaction.notes?.startsWith('Check Return') ||
            transaction.notes?.startsWith('Chq Return');

        let particulars = '';
        if (isCheckReturn) {
            particulars = `Cheque Return (${transaction.referenceId || ''})`;
        } else if (isInvoice) {
            particulars = `Goods Sold to ${transaction.destination || 'Destination'}`;
            if (transaction.vehicleNumber) particulars += ` via ${transaction.vehicleNumber}`;
        } else {
            // Receipt: Check if it's a Stock Return
            const isStockReturn = transaction.notes?.includes('Stock Return');
            if (isStockReturn) {
                particulars = 'Stock Return Received';
            } else {
                const agentPart = transaction.agentName ? ` (By ${transaction.agentName})` : '';
                const notePart = transaction.notes ? ` - ${transaction.notes}` : '';
                particulars = `Receipt Received${agentPart}${notePart}`;
            }
        }

        // --- NEW: DUPLICATE CHECK ---
        // Before appending, check if this receipt/invoice already exists in the sheet
        const existingRow = await findTransactionRow(name, transaction.referenceId);
        if (existingRow !== -1) {
            console.log(`[SheetsDealers] Skipping sync for ${transaction.referenceId} - already exists at row ${existingRow}`);
            return true; // Already synced, we count this as success
        }

        const rowData = [
            new Date(transaction.date).toLocaleDateString('en-IN'), // A: Date
            particulars,                                            // B: Particulars
            isInvoice ? (transaction.referenceId || '') : '',       // C: Invoice No.
            !isInvoice ? (transaction.referenceId || '') : '',      // D: Receipt No.
            isCheckReturn ? 'Cheque Return' : (isInvoice ? 'Sales' : (transaction.notes?.toLowerCase().includes('stock return') ? 'Stock Return' : 'Receipt')), // E: Vch Type
            isInvoice ? transaction.amount : '',                    // F: Sales (Cr)
            !isInvoice ? transaction.amount : '',                   // G: Receipts (Dr)
            Math.abs(runningBalance),                               // H: Balance
            (isInvoice || isCheckReturn) ? 'Cr' : 'Dr'              // I: Type
        ];

        await sheetsRequest(`/values/'${name}'!A11:I1000000:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, 'POST', {
            values: [rowData]
        });
        return true;
    } catch (e) {
        console.error(`[SheetsDealers] Failed to sync transaction for ${name}:`, e);
        return false;
    }
}

/**
 * Writes ALL transactions for a dealer in ONE single API call.
 * Use this for bulk operations instead of calling syncTransactionToDealerSheet
 * per transaction (which hits the 60 write/min quota limit).
 */
export async function batchWriteTransactionsToDealerSheet(
    dealerName: string,
    transactions: any[]
): Promise<boolean> {
    const name = sanitizeTabName(dealerName);
    if (transactions.length === 0) return true;

    try {
        let balance = 0;
        const rows = transactions.map(txn => {
            const isInvoice = txn.type === 'INVOICE';
            if (isInvoice) balance += txn.amount;
            else balance -= txn.amount;

            const isCheckReturn = txn.notes?.startsWith('Cheque Return') ||
                txn.notes?.startsWith('Check Return') ||
                txn.notes?.startsWith('Chq Return');

            let particulars = '';
            if (isCheckReturn) {
                particulars = `Cheque Return (${txn.referenceId || ''})`;
            } else if (isInvoice) {
                particulars = `Goods Sold to ${txn.destination || 'Destination'}`;
                if (txn.vehicleNumber) particulars += ` via ${txn.vehicleNumber}`;
            } else {
                // Receipt: Check if it's a Stock Return
                const isStockReturn = txn.notes?.includes('Stock Return');
                if (isStockReturn) {
                    particulars = 'Stock Return Received';
                } else {
                    const agentPart = txn.agentName ? ` (By ${txn.agentName})` : '';
                    const notePart = txn.notes ? ` - ${txn.notes}` : '';
                    particulars = `Receipt Received${agentPart}${notePart}`;
                }
            }

            return [
                new Date(txn.date).toLocaleDateString('en-IN'), // A: Date
                particulars,                                    // B: Particulars
                isInvoice ? (txn.referenceId || '') : '',       // C: Invoice No.
                !isInvoice ? (txn.referenceId || '') : '',      // D: Receipt No.
                isCheckReturn ? 'Cheque Return' : (isInvoice ? 'Sales' : (txn.notes?.toLowerCase().includes('stock return') ? 'Stock Return' : 'Receipt')), // E: Vch Type
                isInvoice ? txn.amount : '',                    // F: Sales (Cr)
                !isInvoice ? txn.amount : '',                   // G: Receipts (Dr)
                Math.abs(balance),                              // H: Balance
                (isInvoice || isCheckReturn) ? 'Cr' : 'Dr'      // I: Type
            ];
        });

        // ONE API call for all rows
        await sheetsRequest(
            `/values/'${name}'!A11:I1000000:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST',
            { values: rows }
        );
        return true;
    } catch (e) {
        console.error(`[SheetsDealers] batchWriteTransactionsToDealerSheet failed for ${name}:`, e);
        return false;
    }
}

/**
 * Checks if a transaction already exists in a dealer's sheet by reference ID
 */
export async function findTransactionRow(dealerName: string, referenceId: string): Promise<number> {
    const name = sanitizeTabName(dealerName);
    try {
        const res = await sheetsRequest(`/values/'${name}'!C11:D`);
        const rows = res.values || [];
        for (let i = 0; i < rows.length; i++) {
            // Check Invoice (col C) or Receipt (col D)
            if (rows[i][0] === referenceId || rows[i][1] === referenceId) {
                return i + 11;
            }
        }
    } catch (e) { }
    return -1;
}

/**
 * Clears all transaction rows for a dealer to allow a fresh sync.
 * Keeps headers (Rows 1-10).
 */
export async function clearDealerTransactionsForSync(dealerName: string): Promise<void> {
    const name = sanitizeTabName(dealerName);
    try {
        await sheetsRequest(`/values/'${name}'!A11:I:clear`, 'POST');
    } catch (e) {
        console.warn(`[SheetsDealers] Failed to clear ${dealerName} ledger:`, e);
    }
}

/**
 * Bulk sync for migration/initial backup
 */
export async function bulkSyncDealersToSheet(dealers: Dealer[]): Promise<boolean> {
    try {
        await ensureTabExists();
        const rows = dealers.map(dealerToRow);
        await sheetsRequest(`/values/${DEALERS_SHEET_NAME}!A1:K1?valueInputOption=USER_ENTERED`, 'PUT', { values: [DEALER_HEADERS] });
        // Use A:A to force it to look for the next free row starting from Column A
        await sheetsRequest(`/values/${DEALERS_SHEET_NAME}!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, 'POST', { values: rows });
        return true;
    } catch (e) {
        console.error('[SheetsDealers] Bulk sync fail:', e);
        return false;
    }
}

/**
 * Creates individual Google Sheet tabs for ALL dealers that do not yet have one.
 * Uses initializeDealerLedger so format matches exactly (company header, dealer info, period, table).
 * Returns { created, skipped } counts.
 */
export async function bulkCreateDealerTabs(
    dealers: Dealer[],
    companyInfo?: any
): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;
    try {
        // Fetch all existing tab names in one call
        const res = await sheetsRequest('?fields=sheets.properties.title');
        const existingTitles: Set<string> = new Set(
            (res.sheets || []).map((s: any) => s.properties.title as string)
        );

        for (const dealer of dealers) {
            const tabName = sanitizeTabName(dealer.businessName);
            if (existingTitles.has(tabName)) {
                console.log(`[SheetsDealers] Tab exists, skipping: "${tabName}"`);
                skipped++;
            } else {
                console.log(`[SheetsDealers] Creating missing tab: "${tabName}"`);
                await initializeDealerLedger(dealer, companyInfo);
                existingTitles.add(tabName);
                created++;
            }
        }
    } catch (e) {
        console.error('[SheetsDealers] bulkCreateDealerTabs error:', e);
    }
    return { created, skipped };
}

/**
 * Reads the 'refined dealers' messy sheet for initial migration
 */
export async function fetchRefinedDealersRaw(): Promise<any[]> {
    try {
        const res = await sheetsRequest(`/values/'refined dealers'!A:E`);
        const rows = res.values || [];
        if (rows.length <= 1) return [];
        return rows.slice(1).map((r: any) => ({
            businessName: (r[0] || '').trim(),
            address: (r[1] || '').trim(),
            gstNumber: (r[2] || '').trim(),
            phone: (r[3] || '').trim()
        }));
    } catch (e) {
        console.error('[SheetsDealers] Fetch raw fail:', e);
        return [];
    }
}

// --- Internal Helpers ---

async function ensureIndexTabExists(): Promise<void> {
    await ensureTabExists(DEALERS_SHEET_NAME, DEALER_HEADERS);
}

async function ensureTabExists(name: string = DEALERS_SHEET_NAME, headers: string[] = DEALER_HEADERS): Promise<void> {
    try {
        const res = await sheetsRequest('?fields=sheets.properties.title');
        const existing = (res.sheets || []).map((s: any) => s.properties.title);

        if (!existing.includes(name)) {
            console.log(`[SheetsDealers] Creating tab: ${name}`);
            await sheetsRequest(':batchUpdate', 'POST', {
                requests: [{
                    addSheet: {
                        properties: { title: name }
                    }
                }]
            });

            // Initialize with headers
            const colLetter = String.fromCharCode(64 + headers.length);
            const range = `'${name}'!A1:${colLetter}1`;
            await sheetsRequest(`/values/${range}?valueInputOption=USER_ENTERED`, 'PUT', {
                values: [headers]
            });
        }
    } catch (e) {
        console.error(`[SheetsDealers] Failed to ensure tab ${name}:`, e);
    }
}

async function findRowByValue(colIndex: number, val: string): Promise<number> {
    const colLetter = String.fromCharCode(65 + colIndex);
    try {
        const res = await sheetsRequest(`/values/${DEALERS_SHEET_NAME}!${colLetter}:${colLetter}`);
        const rows = res.values || [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === val) return i + 1;
        }
    } catch (e) { }
    return -1;
}

/**
 * Parses the 'Ledger Vouchers' sheet (Tally Export) to extract actual Dealers and their Balances.
 */
export async function parseTallyLedgers(): Promise<any[]> {
    try {
        const response = await sheetsRequest(`/values/'Ledger Vouchers'!A:G`);
        const rows = response.values || [];
        if (rows.length === 0) return [];

        const dealersList: any[] = [];
        let currentDealer: any = null;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const colA = (row[0] || '').toString().trim();
            const colB = (row[1] || '').toString().trim();

            // 1. Detect Dealer Start
            if (colA === 'Ledger:') {
                // If we were parsing a previous dealer, we'd save them here, 
                // but we wait for their balance to be found.
                currentDealer = {
                    businessName: colB,
                    address: '',
                    gstNumber: '',
                    phone: '',
                    balance: 0,
                    foundBalance: false
                };

                // Peek at next row for Address/GST/Phone
                const nextRow = rows[i + 1] || [];
                const infoStr = (nextRow[1] || '').toString();
                if (infoStr && !infoStr.toLowerCase().includes('date')) {
                    currentDealer.address = infoStr;

                    // Extract GST
                    const gstMatch = infoStr.match(/GST\.NO\s*:\s*([0-9A-Z]{15})/i);
                    if (gstMatch) currentDealer.gstNumber = gstMatch[1];

                    // Extract Phone
                    const phoneMatch = infoStr.match(/(?:CELL|PHONE|MOB)\s*:\s*(\d+)/i) || infoStr.match(/\d{10}/);
                    if (phoneMatch) currentDealer.phone = phoneMatch[1] || phoneMatch[0];

                    // Clean address by removing GST/CELL part if possible
                    currentDealer.address = infoStr.split(/GST\.NO|CELL|PHONE|MOB/i)[0].replace(/,$/, '').trim();
                }
            }

            // 2. Detect Closing Balance for the current dealer
            if (currentDealer && (colB.toLowerCase().includes('closing balance') || colA.toLowerCase().includes('closing balance'))) {
                // Tally balance is usually in Column F (Debit) or G (Credit)
                // For dealers, a Debit balance is usually what they owe us.
                const debit = parseFloat((row[5] || '0').toString().replace(/,/g, ''));
                const credit = parseFloat((row[6] || '0').toString().replace(/,/g, ''));

                currentDealer.balance = debit - credit;
                currentDealer.foundBalance = true;

                dealersList.push({ ...currentDealer });
                currentDealer = null; // Reset for next dealer
            }
        }

        console.log(`[SheetsDealers] Parsed ${dealersList.length} dealers from Tally export`);
        return dealersList;
    } catch (error) {
        console.error('[SheetsDealers] Failed to parse Tally ledgers:', error);
        return [];
    }
}

export async function removeDealerFromSheet(id: string, businessName: string): Promise<boolean> {
    const rowIndex = await findRowByValue(10, id);
    if (rowIndex > 0) {
        const empty = Array(11).fill('');
        await sheetsRequest(`/values/${DEALERS_SHEET_NAME}!A${rowIndex}:K${rowIndex}?valueInputOption=USER_ENTERED`, 'PUT', { values: [empty] });
    }
    // Also delete the individual ledger tab to prevent "Ghost Data" if name is reused later
    if (businessName) {
        await deleteDealerSheet(businessName);
    }
    return true;
}

/**
 * Deletes every sheet tab that is NOT in the `keepTabs` list.
 * Tabs in `keepTabs` are preserved exactly as-is (case-sensitive).
 * Returns the number of tabs deleted.
 */
export async function deleteAllTabsExcept(keepTabs: string[]): Promise<number> {
    try {
        const res = await sheetsRequest('?fields=sheets.properties.title,sheets.properties.sheetId,sheets.properties.index');
        const allSheets: { title: string; sheetId: number; index: number }[] =
            (res.sheets || []).map((s: any) => ({
                title: s.properties.title as string,
                sheetId: s.properties.sheetId as number,
                index: s.properties.index as number,
            })).sort((a: any, b: any) => b.index - a.index); // reverse order to avoid index-shift issues

        const toDelete = allSheets.filter(s => !keepTabs.includes(s.title));

        console.log(`[SheetsDealers] ${allSheets.length} total tabs, keeping ${keepTabs.length}, deleting ${toDelete.length}`);

        for (const sheet of toDelete) {
            await sheetsRequest(':batchUpdate', 'POST', {
                requests: [{ deleteSheet: { sheetId: sheet.sheetId } }]
            });
            console.log(`[SheetsDealers] Deleted tab: "${sheet.title}"`);
        }

        return toDelete.length;
    } catch (e) {
        console.error('[SheetsDealers] deleteAllTabsExcept failed:', e);
        return 0;
    }
}
