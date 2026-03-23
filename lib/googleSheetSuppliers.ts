/**
 * Google Sheets Suppliers Service
 * 
 * Fetches "refined suppliers" from Google Sheets for the Purchase Management module.
 */

// Update interface to include balance data
export interface HistoricalVoucher {
    supplierName: string;
    date: string;
    particulars: string;
    vchType: string;
    vchNo: string;
    debit: number;
    credit: number;
}

export interface SyncData {
    vouchers: HistoricalVoucher[];
    supplierBalances: Record<string, number>;
}

import { SupplierData } from '@/types';
import { normalizeSupplierName } from './purchaseService';

const SPREADSHEET_ID = process.env.NEXT_PUBLIC_GOOGLE_SUPPLIERS_SHEET_ID || '1CxjsldaglA9AM0BIudjTjyX5E8mLTijMrLWw4oZ17PA';
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
        scope: 'https://www.googleapis.com/auth/spreadsheets',
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

        // 1. Get all tabs to ensure we have all 5 suppliers
        const metadataResponse = await fetchWithRetry(
            `${SHEETS_API_BASE}?fields=sheets.properties.title`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!metadataResponse.ok) return [];
        const metadata = await metadataResponse.json();
        const tabNames: string[] = metadata.sheets
            ?.map((s: any) => s.properties.title)
            .filter((title: string) => title !== 'Summary') || [];

        // 2. Fetch Summary list for enriched metadata (Address, GST, Balances)
        const summaryResponse = await fetchWithRetry(
            `${SHEETS_API_BASE}/values/Summary!A15:E50`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const summaryData = summaryResponse.ok ? await summaryResponse.json() : { values: [] };
        const summaryRows = summaryData.values || [];

        const suppliers: SupplierData[] = [];

        for (const tabName of tabNames) {
            // Find in summary by normalized match
            const summaryRow = summaryRows.find((row: any) => {
                const summaryName = normalizeSupplierName(row[0] || '');
                const tabNormalized = normalizeSupplierName(tabName);
                return summaryName === tabNormalized || summaryName.includes(tabNormalized) || tabNormalized.includes(summaryName);
            });

            let address = '';
            let city = '';
            let gst = '';
            let balance = 0;
            let phone = '';

            if (summaryRow) {
                address = (summaryRow[1] || '').trim();
                gst = (summaryRow[2] || '').trim();

                // Try to extract city from address (usually "City, State" or just "City")
                if (address.includes(',')) {
                    city = address.split(',')[0].trim();
                } else {
                    city = address;
                }

                const cleanNum = (val: string) => parseFloat((val || '0').replace(/[â‚¹\s,]/g, '')) || 0;
                const balanceStr = (summaryRow[3] || '0');
                const balanceType = (summaryRow[4] || 'Cr').trim();
                balance = cleanNum(balanceStr);
                if (balanceType === 'Dr') balance = -balance;
            }

            // Always try to peek at the tab header for more precise info (Phone, Address)
            try {
                const headerRes = await fetchWithRetry(
                    `${SHEETS_API_BASE}/values/'${tabName}'!A5:A8`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (headerRes.ok) {
                    const hData = await headerRes.json();
                    const hRows = hData.values || [];
                    // Row 6 (Index 1) often has details: "ADDRESS | MOB: 9488... | Email: ..."
                    // Row 7 (Index 2) might have GST: "GST: 33ADYP..."
                    hRows.forEach((hRow: any) => {
                        const line = (hRow[0] || '');
                        if (line.includes('|')) {
                            const parts = line.split('|');
                            parts.forEach((part: string) => {
                                const p = part.trim();
                                if (p.includes('MOB:') || p.includes('CELL:')) {
                                    phone = p.split(/:/)[1]?.trim() || '';
                                }
                                if (p.includes('GST:')) {
                                    gst = p.split('GST:')[1]?.trim() || gst;
                                }
                            });
                        }
                    });

                    // Specific check for city in header row 6 if address was not set
                    if (hRows[1] && hRows[1][0] && !city) {
                        const addrPart = hRows[1][0].split('|')[0] || '';
                        if (addrPart.includes(',')) city = addrPart.split(',').pop()?.trim() || '';
                    }
                }
            } catch (e) {
                console.warn(`[GoogleSheetSuppliers] Could not fetch header for ${tabName}`, e);
            }

            suppliers.push({
                id: `GS-${tabName.replace(/\s+/g, '-')}`,
                name: tabName,
                address,
                city,
                gstNumber: gst,
                phone: phone,
                balance,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }

        return suppliers;
    } catch (error) {
        console.error('[GoogleSheetSuppliers] Failed to fetch suppliers:', error);
        return [];
    }
}

// Fetch historical vouchers and specific closing balances from individual supplier tabs
export async function fetchHistoricalVouchers(): Promise<SyncData> {
    try {
        const token = await getAccessToken();

        const metadataResponse = await fetchWithRetry(
            `${SHEETS_API_BASE}?fields=sheets.properties.title`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!metadataResponse.ok) return { vouchers: [], supplierBalances: {} };
        const metadata = await metadataResponse.json();
        const tabs: string[] = metadata.sheets
            ?.map((s: any) => s.properties.title)
            .filter((title: string) => title !== 'Summary') || [];

        const allVouchers: HistoricalVoucher[] = [];
        const supplierBalances: Record<string, number> = {};

        for (const tabName of tabs) {
            // Fetch a larger block to find where the header actually starts
            const response = await fetchWithRetry(
                `${SHEETS_API_BASE}/values/'${tabName}'!A1:I500`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (!response.ok) continue;

            const data = await response.json();
            const rows = data.values || [];

            // Find the header row (usually contains "Date" in column A)
            let headerIndex = rows.findIndex((r: any) => r[0] === 'Date');
            if (headerIndex === -1) {
                console.warn(`[GoogleSheetSuppliers] Could not find 'Date' header in tab: ${tabName}`);
                continue;
            }

            // Data starts after the header row
            const dataRows = rows.slice(headerIndex + 1);
            let lastBalance = 0;

            const cleanNum = (val: string) => parseFloat((val || '0').replace(/[â‚¹\s,]/g, '')) || 0;

            dataRows.forEach((row: any) => {
                const date = String(row[0] || '').trim();
                const particulars = (row[1] || '').trim();

                // Track balance from column H (index 7) or I (index 8)
                // Tally usually has Balance in Col H and Type in Col I
                const balanceVal = cleanNum(row[7]);
                const balanceType = (row[8] || '').trim();

                if (row[7] !== undefined && row[7] !== '') {
                    lastBalance = balanceVal;
                    if (balanceType === 'Dr') lastBalance = -lastBalance;
                }

                // Skip empty rows or re-headers
                if (!date || date === 'Date' || date.toLowerCase().includes('closing')) {
                    if (date.toLowerCase().includes('closing') && row[7] !== undefined) {
                        // Double check closing balance from this specific row if it exists
                        lastBalance = cleanNum(row[7]);
                        if ((row[8] || '').trim() === 'Dr') lastBalance = -lastBalance;
                    }
                    return;
                }

                const vchType = (row[2] || '').trim();
                const vchNo = (row[4] || '').trim();
                const debit = cleanNum(row[5]);
                const credit = cleanNum(row[6]);

                allVouchers.push({
                    supplierName: tabName,
                    date: date || '01 Apr 19',
                    particulars,
                    vchType,
                    vchNo,
                    debit,
                    credit,
                });
            });

            supplierBalances[tabName] = lastBalance;
            console.log(`[GoogleSheetSuppliers] Tab: ${tabName}, Detected Closing Balance: ${lastBalance}`);
        }

        return { vouchers: allVouchers, supplierBalances };
    } catch (error) {
        console.error('[GoogleSheetSuppliers] Failed to fetch historical vouchers:', error);
        return { vouchers: [], supplierBalances: {} };
    }
}

export interface SupplierSheetDetails {
    supplierName: string;
    supplierAddress?: string;
    supplierCity?: string;
    supplierGst?: string;
    supplierPhone?: string;
    supplierContactPerson?: string;
    openingBalance?: number;
    openingBalanceDate?: string;
}

export interface CompanySheetDetails {
    companyName?: string;
    address?: string;
    city?: string;
    gstNumber?: string;
    phone?: string;
    email?: string;
}

/**
 * Creates a new tab in the Supplier_Group3_Ledger spreadsheet
 * for a newly added supplier, with full Tally-style header matching
 * the existing tab format (company info â†’ supplier info â†’ column headers).
 */
export async function createSupplierSheetTab(
    supplier: SupplierSheetDetails,
    company: CompanySheetDetails = {}
): Promise<boolean> {
    try {
        // Reset cached token so we always get a write-scoped one
        cachedToken = null;
        const token = await getAccessToken();

        const supplierName = supplier.supplierName;

        // 1. Add new sheet tab via batchUpdate
        const addSheetRes = await fetchWithRetry(
            `${SHEETS_API_BASE}:batchUpdate`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    requests: [{
                        addSheet: {
                            properties: {
                                title: supplierName,
                                gridProperties: { rowCount: 500, columnCount: 10 }
                            }
                        }
                    }]
                })
            }
        );

        if (!addSheetRes.ok) {
            const err = await addSheetRes.text();
            // If tab already exists (400), still proceed to write headers
            if (!err.includes('already exists')) {
                console.error('[GoogleSheetSuppliers] Failed to create sheet tab:', err);
                return false;
            }
        }

        // 2. Build the header rows matching the exact Tally format in the screenshot
        const today = new Date();
        const periodEnd = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        // Row 1 â€“ Company name
        const companyName = company.companyName || 'Sri Vari Enterprises';
        // Row 2 â€“ Company address
        const companyAddr = [company.address, company.city].filter(Boolean).join(', ') || 'POLLACHI';
        // Row 3 â€“ GST | MOB | Email
        const companyContact = [
            company.gstNumber ? `GST IN: ${company.gstNumber}` : '',
            company.phone ? `MOB: ${company.phone}` : '',
            company.email ? `Email: ${company.email}` : ''
        ].filter(Boolean).join(' | ');

        // Row 5 â€“ Supplier name heading
        const supplierHeading = `${supplierName} - Ledger Account`;
        // Row 6 â€“ Supplier address
        const supplierAddr = [supplier.supplierAddress, supplier.supplierCity].filter(Boolean).join(', ');
        // Row 7 â€“ GST | CELL
        const supplierContact = [
            supplier.supplierGst ? `GST: ${supplier.supplierGst}` : '',
            supplier.supplierPhone ? `CELL: ${supplier.supplierPhone}` : '',
            supplier.supplierContactPerson ? `Contact: ${supplier.supplierContactPerson}` : ''
        ].filter(Boolean).join(' | ');
        // Row 8 â€“ Period
        const period = `Period: 01 Apr 2019 To ${periodEnd}`;

        // Build the rows array (10 rows before data starts at row 11)
        const headerRows = [
            [companyName],                                                              // Row 1
            [companyAddr],                                                              // Row 2
            [companyContact],                                                           // Row 3
            [''],                                                                       // Row 4 (blank)
            [supplierHeading],                                                          // Row 5
            [supplierAddr || ''],                                                       // Row 6
            [supplierContact || ''],                                                    // Row 7
            [period],                                                                   // Row 8
            [''],                                                                       // Row 9 (blank)
            ['Date', 'Particulars', 'Vch Type', 'Vch Ref.', 'Vch No.', 'Debit (\u20b9)', 'Credit (\u20b9)', 'Balance (\u20b9)', 'Balance Type', '']  // Row 10
        ];

        const isCredit = (supplier.openingBalance || 0) >= 0;
        const balanceVal = Math.abs(supplier.openingBalance || 0);

        // Determine Opening Balance Date
        let dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
        if (supplier.openingBalanceDate) {
            dateStr = new Date(supplier.openingBalanceDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
        }

        // Always add the Opening Balance row (even if 0) for consistency with Dealer ledger
        headerRows.push([
            dateStr,
            'Opening Balance',
            '',
            '',
            '',
            '', // Debit Column (Blank)
            '', // Credit Column (Blank)
            String(balanceVal),
            isCredit ? 'Cr' : 'Dr',
            ''
        ]);


        const sheetRange = `'${supplierName}'!A1:J11`;
        const writeRes = await fetchWithRetry(
            `${SHEETS_API_BASE}/values/${encodeURIComponent(sheetRange)}?valueInputOption=RAW`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values: headerRows })
            }
        );

        if (!writeRes.ok) {
            const err = await writeRes.text();
            console.warn('[GoogleSheetSuppliers] Tab created but header write failed:', err);
        }

        // 3. Bold + freeze the header row (row 10) using batchUpdate formatting
        const addSheetData = !addSheetRes.ok ? null : await addSheetRes.json().catch(() => null);
        const sheetId: number | null = addSheetData?.replies?.[0]?.addSheet?.properties?.sheetId ?? null;

        if (sheetId !== null) {
            await fetchWithRetry(
                `${SHEETS_API_BASE}:batchUpdate`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        requests: [
                            // Bold company name (row 1)
                            {
                                repeatCell: {
                                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
                                    cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } },
                                    fields: 'userEnteredFormat(textFormat)'
                                }
                            },
                            // Bold supplier heading (row 5)
                            {
                                repeatCell: {
                                    range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 },
                                    cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
                                    fields: 'userEnteredFormat(textFormat)'
                                }
                            },
                            // Dark blue header row (row 10) - matches screenshot exactly
                            {
                                repeatCell: {
                                    range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 9 },
                                    cell: {
                                        userEnteredFormat: {
                                            backgroundColor: { red: 0.07, green: 0.23, blue: 0.39 },
                                            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                                            horizontalAlignment: 'CENTER'
                                        }
                                    },
                                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                                }
                            },
                            // Format Row 11 (Opening Balance) specifically with Light Green background exactly matching screenshot
                            {
                                repeatCell: {
                                    range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 0, endColumnIndex: 9 },
                                    cell: {
                                        userEnteredFormat: {
                                            backgroundColor: { red: 0.87, green: 0.925, blue: 0.83 },
                                            textFormat: { bold: true, foregroundColor: { red: 0, green: 0, blue: 0 } },
                                            horizontalAlignment: 'LEFT'
                                        }
                                    },
                                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                                }
                            },
                            // Right align Debit/Credit/Balance for Row 11
                            {
                                repeatCell: {
                                    range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 5, endColumnIndex: 8 },
                                    cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
                                    fields: 'userEnteredFormat(horizontalAlignment)'
                                }
                            },
                            // Date Column (A) format: dd Mmm yy
                            {
                                repeatCell: {
                                    range: { sheetId, startRowIndex: 10, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 1 },
                                    cell: {
                                        userEnteredFormat: {
                                            numberFormat: { type: 'DATE', pattern: 'dd mmm yy' }
                                        }
                                    },
                                    fields: 'userEnteredFormat(numberFormat)'
                                }
                            },
                            // Column Widths
                            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
                            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } },
                            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
                            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
                            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },
                            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
                            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
                            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
                            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
                            
                            // Freeze first 10 rows
                            {
                                updateSheetProperties: {
                                    properties: {
                                        sheetId,
                                        gridProperties: { frozenRowCount: 10 }
                                    },
                                    fields: 'gridProperties.frozenRowCount'
                                }
                            }
                        ]
                    })
                }
            );
        }

        console.log(`[GoogleSheetSuppliers] Created new sheet tab: "${supplierName}" with full header`);
        return true;
    } catch (error) {
        console.error('[GoogleSheetSuppliers] createSupplierSheetTab failed:', error);
        return false;
    }
}


export interface SheetRowData {
    date: string;
    particulars: string;
    vchType: string;
    vchRef: string;
    vchNo: string;
    debit: number;
    credit: number;
    balance: number;
    balanceType: string;
}

async function getSheetIdByName(token: string, sheetName: string): Promise<number | null> {
    try {
        const res = await fetchWithRetry(`${SHEETS_API_BASE}?fields=sheets.properties`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const data = await res.json();

        const searchName = normalizeSupplierName(sheetName);

        const sheet = data.sheets.find((s: any) =>
            normalizeSupplierName(s.properties.title) === searchName ||
            s.properties.title.toLowerCase().trim() === sheetName.toLowerCase().trim()
        );

        if (sheet) {
            console.log(`[GoogleSheetSuppliers] Found sheetId ${sheet.properties.sheetId} for "${sheetName}" (tab: "${sheet.properties.title}")`);
            return sheet.properties.sheetId;
        }

        console.warn(`[GoogleSheetSuppliers] Tab not found for "${sheetName}". Available tabs: ${data.sheets.map((s: any) => s.properties.title).join(', ')}`);
        return null;
    } catch (err) {
        console.error('[GoogleSheetSuppliers] Error in getSheetIdByName:', err);
        return null;
    }
}

export async function appendToSupplierSheetTab(
    supplierName: string,
    row: SheetRowData
): Promise<boolean> {
    if (row.vchNo === 'BAL B/F') {
        console.log('[GoogleSheetSuppliers] Skipping append for BAL B/F row (already in header)');
        return true;
    }
    try {
        const token = await getAccessToken();
        const sheetId = await getSheetIdByName(token, supplierName);
        if (sheetId === null) {
            console.warn(`[GoogleSheetSuppliers] Skipping append: No tab found for "${supplierName}"`);
            return false;
        }

        const isOpeningBal = row.particulars.toLowerCase().includes('opening balance');
        const isClosingBal = row.particulars.includes('CLOSED');

        const formatAmount = (val: number) => val === 0 ? '0' : val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const debitStr = formatAmount(row.debit);
        const creditStr = formatAmount(row.credit);
        const balStr = formatAmount(Math.abs(row.balance));

        const dt = new Date(row.date);
        const dateStr = !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : row.date;

        // Build the cells with explicit formatting (Light green for Opening balances, White otherwise)
        const cellFormat = {
            backgroundColor: isOpeningBal ? { red: 0.87, green: 0.925, blue: 0.83 } : { red: 1, green: 1, blue: 1 },
            textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, bold: isOpeningBal || isClosingBal, fontSize: 10 },
            horizontalAlignment: 'LEFT' as const
        };

        const debitFormat = isOpeningBal ? cellFormat : { ...cellFormat, textFormat: { ...cellFormat.textFormat, foregroundColor: {red: 0.8, green: 0, blue: 0} } };
        const creditFormat = isOpeningBal ? cellFormat : { ...cellFormat, textFormat: { ...cellFormat.textFormat, foregroundColor: {red: 0, green: 0.5, blue: 0} } };

        const rowData = {
            values: [
                { userEnteredValue: { stringValue: dateStr }, userEnteredFormat: cellFormat },
                { userEnteredValue: { stringValue: row.particulars }, userEnteredFormat: cellFormat },
                { userEnteredValue: { stringValue: row.vchType }, userEnteredFormat: cellFormat },
                { userEnteredValue: { stringValue: row.vchRef }, userEnteredFormat: cellFormat },
                { userEnteredValue: { stringValue: row.vchNo }, userEnteredFormat: cellFormat },
                { userEnteredValue: { stringValue: debitStr }, userEnteredFormat: { ...debitFormat, horizontalAlignment: 'RIGHT' } },
                { userEnteredValue: { stringValue: creditStr }, userEnteredFormat: { ...creditFormat, horizontalAlignment: 'RIGHT' } },
                { userEnteredValue: { stringValue: balStr }, userEnteredFormat: { ...cellFormat, horizontalAlignment: 'RIGHT', textFormat: { ...cellFormat.textFormat, bold: true } } },
                { userEnteredValue: { stringValue: row.balanceType }, userEnteredFormat: cellFormat }
            ]
        };

        const res = await fetchWithRetry(`${SHEETS_API_BASE}:batchUpdate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [
                    {
                        appendCells: {
                            sheetId: sheetId,
                            rows: [rowData],
                            fields: 'userEnteredValue,userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                        }
                    }
                ]
            })
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[GoogleSheetSuppliers] Final Append failed for "${supplierName}". Status: ${res.status}`, errorText);
            return false;
        }

        console.log(`[GoogleSheetSuppliers] SUCCESS: Appended formatted ${row.vchType} row to "${supplierName}"`);
        return true;
    } catch (error: unknown) {
        console.warn('[GoogleSheetSuppliers] appendToSupplierSheetTab error:', error);
        return false;
    }
}

/**
 * Finds and deletes rows in a supplier's sheet tab that match a given vchNo (bill/payment number).
 * Used when a bill or payment is deleted in the UI so the sheet is kept in sync.
 */
export async function deleteSheetRowByRef(
    supplierName: string,
    vchNo: string
): Promise<boolean> {
    try {
        if (!supplierName || supplierName === 'Unknown' || !vchNo) return false;

        const token = await getAccessToken();
        const sheetId = await getSheetIdByName(token, supplierName);
        if (sheetId === null) {
            console.warn(`[GoogleSheetSuppliers] deleteSheetRowByRef: No tab for "${supplierName}"`);
            return false;
        }

        // Fetch all rows to find the matching vchNo (column E, index 4)
        const tabTitle = supplierName;
        const rangeRes = await fetchWithRetry(
            `${SHEETS_API_BASE}/values/'${encodeURIComponent(tabTitle)}'!A1:I500`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!rangeRes.ok) return false;
        const rangeData = await rangeRes.json();
        const rows: any[][] = rangeData.values || [];

        // Find 0-indexed row numbers where column E (index 4) equals the vchNo
        const rowsToDelete: number[] = [];
        rows.forEach((row, idx) => {
            const cellVal = String(row[4] || '').trim();
            if (cellVal === vchNo) {
                rowsToDelete.push(idx);
            }
        });

        if (rowsToDelete.length === 0) {
            console.log(`[GoogleSheetSuppliers] deleteSheetRowByRef: No matching rows for vchNo "${vchNo}" in "${supplierName}"`);
            return true; // Nothing to delete, not an error
        }

        // Delete from bottom to top to avoid index shifting
        const deleteRequests = rowsToDelete.reverse().map(rowIdx => ({
            deleteDimension: {
                range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: rowIdx,
                    endIndex: rowIdx + 1
                }
            }
        }));

        const delRes = await fetchWithRetry(`${SHEETS_API_BASE}:batchUpdate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requests: deleteRequests })
        });

        if (!delRes.ok) {
            const errText = await delRes.text();
            console.error(`[GoogleSheetSuppliers] deleteSheetRowByRef failed for "${supplierName}" / "${vchNo}": ${errText}`);
            return false;
        }

        console.log(`[GoogleSheetSuppliers] Deleted ${rowsToDelete.length} row(s) matching vchNo "${vchNo}" in tab "${supplierName}"`);
        return true;
    } catch (err) {
        console.warn('[GoogleSheetSuppliers] deleteSheetRowByRef error:', err);
        return false;
    }
}