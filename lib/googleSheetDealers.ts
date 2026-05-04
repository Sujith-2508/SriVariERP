/**
 * Google Sheets Dealers Service  (quota-safe version)
 *
 * ALL WRITES  → enqueueOp  (localStorage queue, flushed ≤30/min)
 * ALL READS   → cachedRead (5-min HTTP cache; stale data on 429)
 * Tab existence → tracked in localStorage to avoid repetitive API meta-reads
 *
 * Spreadsheet ID: 1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0
 */

import { Dealer } from '@/types';
import { enqueueOp, cachedRead, clearReadCache } from './sheetsQueue';

const SPREADSHEET_ID = '1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0';
export const DEALERS_SHEET_NAME = 'Dealers';

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
    'Opening Balance',  // K
    'Supabase ID'       // L (Key for syncing)
];

const INDIVIDUAL_LEDGER_HEADERS = [
    'Date',             // A
    'Particulars',      // B
    'Invoice No.',      // C
    'Receipt No.',      // D
    'Vch Type',         // E
    'Sales (Cr ₹)',     // F
    'Receipts (Dr ₹)',  // G
    'Balance (₹)',      // H
    'Type'              // I
];

// Running balance in sheet is aligned with UI ledger view:
// opening + invoices (Dr) - receipts (Cr)

// ── Shared spreadsheet base URL (for cachedRead & enqueueOp)
// The sheetsQueue already appends this — we just need the path suffixes.
// But cachedRead/enqueueOp in sheetsQueue use the products spreadsheet by default.
// For the DEALERS spreadsheet we need a different approach: we'll do direct fetch
// through the same getAccessToken from sheetsQueue but pointing at DEALERS spreadsheet.

// ── localStorage key for known-tab cache (avoids meta read per tab)
const KNOWN_TABS_KEY = 'sve_dealer_tabs';

function getKnownTabs(): Set<string> {
    try {
        return new Set(JSON.parse(localStorage.getItem(KNOWN_TABS_KEY) || '[]'));
    } catch { return new Set(); }
}

function addKnownTab(name: string): void {
    try {
        const tabs = getKnownTabs();
        tabs.add(name.trim().toLowerCase());
        localStorage.setItem(KNOWN_TABS_KEY, JSON.stringify([...tabs]));
    } catch {}
}

function isKnownTab(name: string): boolean {
    return getKnownTabs().has(name.trim().toLowerCase());
}

// ── Rate-limited direct fetch for DEALER spreadsheet (read only, cached via sheetsQueue pattern)
// We call cachedRead with a special prefix since sheetsQueue defaults to PRODUCTS spreadsheet.
// Instead, we replicate the read-pattern here for the DEALERS spreadsheet.

const DEAL_SHEETS_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const TOKEN_KEY = 'sve_google_token';
const LAST_REQ_KEY = 'sve_last_sheet_req';
const READ_GAP_MS = 2_000;
const CACHE_TTL_MS = 5 * 60_000;
const WRITE_MAX_RETRIES = 4;
const WRITE_RETRY_BASE_MS = 1_000;

// In-memory read cache keyed by path
const dealerReadCache: Record<string, { data: any; ts: number }> = {};

async function getDealerToken(): Promise<string> {
    try {
        const cached = localStorage.getItem(TOKEN_KEY);
        if (cached) {
            const { token, expires } = JSON.parse(cached);
            if (Date.now() < expires) return token;
        }
    } catch {}

    const serviceAccountKey = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY not set');
    const credentials = JSON.parse(serviceAccountKey);

    const now = Math.floor(Date.now() / 1000);
    const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const b64urlBuf = (buf: ArrayBuffer) => {
        const bytes = new Uint8Array(buf); let bin = '';
        bytes.forEach(b => bin += String.fromCharCode(b));
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600, iat: now,
    }));
    const signInput = `${header}.${claims}`;
    const pem = credentials.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\\n/g, '').replace(/\n/g, '').replace(/\s/g, '');
    const pemBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    const pk = await crypto.subtle.importKey('pkcs8', pemBytes.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pk, new TextEncoder().encode(signInput));
    const jwt = `${signInput}.${b64urlBuf(sig)}`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenRes.json();
    const expires = Date.now() + (tokenData.expires_in - 60) * 1000;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: tokenData.access_token, expires }));
    return tokenData.access_token;
}

/** Rate-limited read from the DEALERS spreadsheet, with in-memory cache. */
async function dealerRead(path: string): Promise<any> {
    const cacheKey = `dealer:${path}`;
    const cached = dealerReadCache[cacheKey];
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.data;
    }
    // Enforce rate limit against the shared key
    const lastReq = parseInt(localStorage.getItem(LAST_REQ_KEY) || '0', 10);
    const wait = READ_GAP_MS - (Date.now() - lastReq);
    if (wait > 0) await new Promise(r => setTimeout(r, wait + 50));
    localStorage.setItem(LAST_REQ_KEY, String(Date.now()));

    const token = await getDealerToken();
    // --- Retry Logic for Transient 5xx Errors ---
    let retries = 0;
    const MAX_RETRIES = 3;
    
    while (retries < MAX_RETRIES) {
        try {
            const token = await getDealerToken();
            const res = await fetch(`${DEAL_SHEETS_BASE}${path}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.status === 429 || res.status >= 500) {
                const isRateLimit = res.status === 429;
                retries++;
                const delay = isRateLimit ? 5000 : 2000 * retries;
                console.warn(`[SheetsDealers] ${res.status} error. Retry ${retries}/${MAX_RETRIES} in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (!res.ok) {
                const txt = await res.text();
                console.error('[SheetsDealers] Read error', res.status, txt.slice(0, 200));
                return null;
            }

            const data = await res.json();
            dealerReadCache[cacheKey] = { data, ts: Date.now() };
            return data;
        } catch (err) {
            retries++;
            if (retries >= MAX_RETRIES) throw err;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return null;
}

/** Enqueue a write to the DEALERS spreadsheet.
 *  We can't use the shared enqueueOp directly (it defaults to products spreadsheet),
 *  so we store a DEALERS-prefixed entry and handle it via the same queue mechanism.
 *  
 *  SIMPLIFICATION: Since sheetsQueue doesn't know about the dealers spreadsheet,
 *  we do a direct write here but with rate-limit coordination via the shared key.
 */
async function dealerWrite(path: string, method: string, body?: any): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= WRITE_MAX_RETRIES; attempt++) {
        try {
            // Enforce rate limit across all sheet modules
            const lastReq = parseInt(localStorage.getItem(LAST_REQ_KEY) || '0', 10);
            const wait = READ_GAP_MS - (Date.now() - lastReq);
            if (wait > 0) await new Promise(r => setTimeout(r, wait + 50));
            localStorage.setItem(LAST_REQ_KEY, String(Date.now()));

            const token = await getDealerToken();
            const res = await fetch(`${DEAL_SHEETS_BASE}${path}`, {
                method,
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });

            if (res.ok) {
                // Invalidate related read cache on successful write
                Object.keys(dealerReadCache).forEach(k => {
                    if (k.includes(path.split('!')[0])) delete dealerReadCache[k];
                });
                return;
            }

            const txt = await res.text();
            if (txt.includes('already exists')) {
                console.log('[SheetsDealers] Tab already exists, skipping create:', path);
                return;
            }

            const retryable = res.status === 429 || res.status >= 500;
            if (retryable && attempt < WRITE_MAX_RETRIES) {
                const delay = WRITE_RETRY_BASE_MS * Math.pow(2, attempt - 1);
                console.warn(`[SheetsDealers] Write retry ${attempt}/${WRITE_MAX_RETRIES} after status ${res.status}: ${path}`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            lastError = new Error(`[SheetsDealers] Write error ${res.status} for ${path}: ${txt.slice(0, 300)}`);
            break;
        } catch (err: any) {
            const msg = err?.message || String(err);
            if (attempt < WRITE_MAX_RETRIES) {
                const delay = WRITE_RETRY_BASE_MS * Math.pow(2, attempt - 1);
                console.warn(`[SheetsDealers] Network retry ${attempt}/${WRITE_MAX_RETRIES} for ${path}: ${msg}`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            lastError = new Error(`[SheetsDealers] Network write failure for ${path}: ${msg}`);
            break;
        }
    }

    throw lastError || new Error(`[SheetsDealers] Write failed for ${path}`);
}

// ──────────── Tab Name Sanitizer ────────────
export function sanitizeTabName(name: string): string {
    if (!name) return 'Untitled';
    let sanitized = name
        .replace(/[:\\/?*[\]]/g, ' ')
        .replace(/'/g, '')
        .replace(/[^\w\s.,&-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (sanitized.length > 31) sanitized = sanitized.substring(0, 31).trim();
    return sanitized || 'Untitled';
}

// ──────────── Row helper ────────────
function dealerToRow(dealer: Dealer): any[] {
    return [
        dealer.businessName, dealer.contactPerson || '', dealer.phone,
        dealer.city || '', dealer.district || '', dealer.state || '',
        dealer.pinCode || '', dealer.gstNumber || '', dealer.address || '',
        dealer.balance || 0, dealer.openingBalance || 0, dealer.id,
    ];
}

function parseAmount(value: any): number {
    if (value === null || value === undefined) return 0;
    const num = parseFloat(String(value).replace(/[₹,\s]/g, '').trim());
    return Number.isFinite(num) ? num : 0;
}

function formatAmount(value: number): string {
    return Number(parseFloat(String(value)).toFixed(2)).toString();
}

function formatTxnDateTime(dateValue: any, createdAtValue?: any): string {
    const baseDate = new Date(dateValue);
    const timeSource = createdAtValue ? new Date(createdAtValue) : baseDate;

    const datePart = baseDate.toLocaleDateString('en-IN');
    const timePart = timeSource.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });

    return `${datePart} ${timePart}`;
}

// ──────────── Ensure index tab exists (cached) ────────────
async function ensureIndexTabExists(): Promise<void> {
    if (isKnownTab(DEALERS_SHEET_NAME)) return; // Already confirmed to exist
    // Queue a create — errors like "already exists" are swallowed in dealerWrite
    await dealerWrite(':batchUpdate', 'POST', {
        requests: [{ addSheet: { properties: { title: DEALERS_SHEET_NAME } } }]
    });
    // Write headers
    await dealerWrite(
        `/values/${DEALERS_SHEET_NAME}!A1:L1?valueInputOption=USER_ENTERED`,
        'PUT',
        { values: [DEALER_HEADERS] }
    );
    addKnownTab(DEALERS_SHEET_NAME);
}

// ──────────── Find dealer row in index (cached read) ────────────
async function findDealerRowById(id: string): Promise<number> {
    const data = await dealerRead(`/values/${DEALERS_SHEET_NAME}!L:L`);
    if (!data) return -1;
    const rows: string[][] = data.values || [];
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === id) return i + 1;
    }
    return -1;
}

// ──────────── Sync dealer to index sheet + init ledger ────────────
export async function syncDealerToSheet(dealer: Dealer, companyInfo?: any): Promise<boolean> {
    const name = sanitizeTabName(dealer.businessName);
    console.log(`[SheetsDealers] Queuing sync for dealer: ${dealer.businessName}`);
    try {
        const rowData = dealerToRow(dealer);
        const rowIndex = await findDealerRowById(dealer.id);

        if (rowIndex > 0) {
            await dealerWrite(
                `/values/${DEALERS_SHEET_NAME}!A${rowIndex}:L${rowIndex}?valueInputOption=USER_ENTERED`,
                'PUT', { values: [rowData] }
            );
        } else {
            await ensureIndexTabExists();
            await dealerWrite(
                `/values/${DEALERS_SHEET_NAME}!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
                'POST', { values: [rowData] }
            );
        }

        // Init ledger tab (skipped if tab already known)
        await initializeDealerLedger(dealer, companyInfo);
        return true;
    } catch (e) {
        console.error(`[SheetsDealers] Sync fail for ${dealer.businessName}:`, e);
        return false;
    }
}

// ──────────── Initialize dealer ledger tab ────────────
export async function initializeDealerLedger(dealer: Dealer, companyInfo: any): Promise<void> {
    if (!dealer?.businessName) return;
    const name = sanitizeTabName(dealer.businessName);

    // Create sheet if not known
    if (!isKnownTab(name)) {
        await dealerWrite(':batchUpdate', 'POST', {
            requests: [{ addSheet: { properties: { title: name } } }]
        });
        addKnownTab(name);
    }

    const openingDateStr = dealer.openingBalanceDate
        ? new Date(dealer.openingBalanceDate).toLocaleDateString('en-GB')
        : new Date().toLocaleDateString('en-GB');
    const isDebit = (dealer.openingBalance || 0) >= 0;
    const balanceVal = Math.abs(dealer.openingBalance || 0);

    const rows = [
        [companyInfo?.companyName || 'SRI VARI ENTERPRISES', '', '', '', '', '', '', '', ''],
        [companyInfo?.addressLine1 || '', '', '', '', '', '', '', '', ''],
        [`GST IN: ${companyInfo?.gstNumber || ''} | MOB: ${companyInfo?.phone || ''} | Email: ${companyInfo?.email || ''}`, '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', ''],
        [`${dealer.businessName} - Ledger Account`, '', '', '', '', '', '', '', ''],
        [`${dealer.address || ''} | CELL: ${dealer.phone} | GST: ${dealer.gstNumber || ''}`, '', '', '', '', '', '', '', ''],
        [`Period: 01 Apr 2019 To ${new Date().toLocaleDateString('en-IN')}`, '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', ''],
        INDIVIDUAL_LEDGER_HEADERS,
        [openingDateStr, 'Opening Balance', '', '', '', '', '', String(balanceVal), isDebit ? 'Dr' : 'Cr'],
    ];

    await dealerWrite(`/values/${quoteSheetName(name)}!A1:I10?valueInputOption=USER_ENTERED`, 'PUT', { values: rows });
    await styleDealerLedgerRows(name);
}

// ──────────── Delete dealer sheet tab ────────────
export async function deleteDealerSheet(sheetName: string): Promise<boolean> {
    const name = sanitizeTabName(sheetName);
    try {
        const data = await dealerRead('?fields=sheets.properties.title,sheets.properties.sheetId');
        if (!data) return false;
        const sheet = (data.sheets || []).find((s: any) => s.properties.title === name);
        if (sheet) {
            await dealerWrite(':batchUpdate', 'POST', {
                requests: [{ deleteSheet: { sheetId: sheet.properties.sheetId } }]
            });
        }
        return true;
    } catch (e) {
        console.error(`[SheetsDealers] Failed to delete sheet ${sheetName}:`, e);
        return false;
    }
}

// ──────────── Append single transaction (NO running balance - computed in UI) ────────────
export async function syncTransactionToDealerSheet(dealerName: string, transaction: any): Promise<boolean> {
    if (transaction.referenceId === 'BAL B/F') return true;
    const name = sanitizeTabName(dealerName);
    try {
        // Keep a single terminal closing row by removing stale one before appending a new transaction.
        await removeClosingRows(name);

        const isInvoice = transaction.type === 'INVOICE';
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
            const isStockReturn = transaction.notes?.includes('Stock Return');
            if (isStockReturn) {
                particulars = 'Stock Return Received';
            } else {
                const agentPart = transaction.agentName ? ` (By ${transaction.agentName})` : '';
                const notePart = transaction.notes ? ` - ${transaction.notes}` : '';
                particulars = `Receipt Received${agentPart}${notePart}`;
            }
        }

        // Read current ledger rows to derive latest running balance from sheet.
        const existing = await dealerRead(`/values/${quoteSheetName(name)}!F10:H10000`);
        const existingRows: any[][] = existing?.values || [];

        let runningBalance = 0;
        if (existingRows.length > 0) {
            // Opening row has balance in H (index 2 for F:G:H range)
            runningBalance = parseAmount(existingRows[0]?.[2]);
            // Transaction rows contain Sales in F and Receipts in G
            for (let i = 1; i < existingRows.length; i++) {
                const row = existingRows[i] || [];
                const sales = parseAmount(row[0]);
                const receipts = parseAmount(row[1]);
                runningBalance += sales - receipts;
            }
        }

        const amount = parseAmount(transaction.amount);
        const nextRunning = runningBalance + ((isInvoice || isCheckReturn) ? amount : -amount);

        const rowData = [
            formatTxnDateTime(transaction.date, transaction.createdAt),
            particulars,
            isInvoice ? (transaction.referenceId || '') : '',
            !isInvoice ? (transaction.referenceId || '') : '',
            isCheckReturn ? 'Cheque Return' : (isInvoice ? 'Sales' : (transaction.notes?.toLowerCase().includes('stock return') ? 'Stock Return' : 'Receipt')),
            isInvoice ? amount : '',
            !isInvoice ? amount : '',
            formatAmount(Math.abs(nextRunning)),
            (isInvoice || isCheckReturn) ? 'Dr' : 'Cr',
        ];

        await dealerWrite(
            `/values/${quoteSheetName(name)}!A11:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST', { values: [rowData] }
        );

        // Always keep the sheet-level closing balance row visible and updated.
        await appendClosingRow(name, nextRunning, transaction.date, transaction.createdAt);
        await styleDealerLedgerRows(name);
        return true;
    } catch (e) {
        console.error(`[SheetsDealers] Failed to sync transaction for ${name}:`, e);
        return false;
    }
}

// ──────────── Batch write all transactions (one API call, NO running balance) ────────────
export async function batchWriteTransactionsToDealerSheet(
    dealerName: string, transactions: any[], companyInfo?: any
): Promise<boolean> {
    const name = sanitizeTabName(dealerName);
    const quotedName = quoteSheetName(name);
    const filteredTxns = transactions.filter(t => t.referenceId !== 'BAL B/F');
    if (filteredTxns.length === 0) {
        await removeClosingRows(name);
        const openingData = await dealerRead(`/values/${quotedName}!A10:H10`);
        const openingDateVal = openingData?.values?.[0]?.[0] || new Date();
        const openingBalVal = parseAmount(openingData?.values?.[0]?.[7]);
        await appendClosingRow(name, openingBalVal, openingDateVal, openingDateVal);
        await styleDealerLedgerRows(name);
        return true;
    }

    // Protect against accidental duplicate transaction objects in memory/state.
    const seen = new Set<string>();
    const dedupedTxns = filteredTxns.filter(txn => {
        const key = txn.id || `${txn.referenceId || ''}|${txn.type || ''}|${txn.date || ''}|${txn.amount || 0}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Build the rows first
    const openingTxn = transactions.find(t => t.referenceId === 'BAL B/F');
    let runningBalance = openingTxn ? parseAmount(openingTxn.amount) : 0;

    // Fallback: if no BAL B/F txn exists, read opening balance from row 10 column H
    if (!openingTxn) {
        const openingData = await dealerRead(`/values/${quotedName}!H10:H10`);
        runningBalance = parseAmount(openingData?.values?.[0]?.[0]);
    }

    const sortedTxns = [...dedupedTxns].sort((a, b) => {
        if (a.referenceId === 'BAL B/F') return -1;
        if (b.referenceId === 'BAL B/F') return 1;

        const eventA = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime();
        const eventB = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime();
        if (eventA !== eventB) return eventA - eventB;

        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;

        const refA = a.referenceId || '';
        const refB = b.referenceId || '';
        return refA.localeCompare(refB);
    });

    const rows = sortedTxns.map(txn => {
        const isInvoice = txn.type === 'INVOICE';
        const isCheckReturn = txn.notes?.startsWith('Cheque Return') ||
            txn.notes?.startsWith('Check Return') || txn.notes?.startsWith('Chq Return');
        let particulars = '';
        if (isCheckReturn) {
            particulars = `Cheque Return (${txn.referenceId || ''})`;
        } else if (isInvoice) {
            particulars = `Goods Sold to ${txn.destination || 'Destination'}`;
            if (txn.vehicleNumber) particulars += ` via ${txn.vehicleNumber}`;
        } else {
            const isStockReturn = txn.notes?.includes('Stock Return');
            if (isStockReturn) {
                particulars = 'Stock Return Received';
            } else {
                const agentPart = txn.agentName ? ` (By ${txn.agentName})` : '';
                const notePart = txn.notes ? ` - ${txn.notes}` : '';
                particulars = `Receipt Received${agentPart}${notePart}`;
            }
        }
        const amount = parseAmount(txn.amount);
        runningBalance += (isInvoice || isCheckReturn) ? amount : -amount;

        return [
            formatTxnDateTime(txn.date, txn.createdAt), particulars,
            isInvoice ? (txn.referenceId || '') : '', !isInvoice ? (txn.referenceId || '') : '',
            isCheckReturn ? 'Cheque Return' : (isInvoice ? 'Sales' : (txn.notes?.toLowerCase().includes('stock return') ? 'Stock Return' : 'Receipt')),
            isInvoice ? amount : '', !isInvoice ? amount : '',
            formatAmount(Math.abs(runningBalance)),
            (isInvoice || isCheckReturn) ? 'Dr' : 'Cr',
        ];
    });

    // Ensure sheet exists
    if (!isKnownTab(name)) {
        console.log(`[SheetsDealers] Creating sheet for "${name}"...`);
        await initializeDealerLedger({
            businessName: dealerName,
            openingBalance: 0,
            address: '',
            phone: '',
            gstNumber: ''
        } as Dealer, companyInfo);
        // Wait for sheet to be ready
        await new Promise(r => setTimeout(r, 2000));
    }

    // Deterministic write for full-sync rebuilds: overwrite exact data range after clear.
    await removeClosingRows(name);
    await dealerWrite(
        `/values/${quotedName}!A11:I${10 + rows.length}?valueInputOption=USER_ENTERED`,
        'PUT', { values: rows }
    );

    const lastTxn = sortedTxns[sortedTxns.length - 1];
    await appendClosingRow(name, runningBalance, lastTxn?.date, lastTxn?.createdAt);
    await styleDealerLedgerRows(name);

    console.log(`[SheetsDealers] Wrote ${rows.length} transactions + closing row for ${name}`);
    return true;
}

// ──────────── Rollover rows (FY close/open markers) ────────────
export async function appendRolloverRowsToDealerSheet(dealerName: string, balance: number, closingDateStr: string, openingDateStr: string): Promise<void> {
    const name = sanitizeTabName(dealerName);
    const quotedName = quoteSheetName(name);
    const balanceAbs = formatAmount(Math.abs(balance));
    const balanceType = balance >= 0 ? 'Dr' : 'Cr';

    const closingDate = new Date(closingDateStr).toLocaleDateString('en-GB');
    const openingDate = new Date(openingDateStr).toLocaleDateString('en-GB');

    const rows = [
        [closingDate, 'Closing Balance (Financial Year End)', 'CL-END', '', 'Closing', '', '', balanceAbs, balanceType],
        [openingDate, 'Opening Balance (Forwarded)', 'BAL B/F', '', 'Opening', '', '', balanceAbs, balanceType],
    ];

    try {
        if (!isKnownTab(name)) {
            addKnownTab(name);
        }
        await dealerWrite(
            `/values/${quotedName}!A11:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST',
            { values: rows }
        );
        await styleDealerLedgerRows(name);
        console.log('[SheetsDealers] Appended rollover rows', { dealerName, closingDateStr, openingDateStr, balance });
    } catch (e) {
        console.warn('[SheetsDealers] Failed to append rollover rows:', { dealerName, error: e });
    }
}

// ──────────── Find transaction row (cached read) ────────────
export async function findTransactionRow(dealerName: string, referenceId: string): Promise<number> {
    const name = sanitizeTabName(dealerName);
    try {
        const data = await dealerRead(`/values/${quoteSheetName(name)}!C11:D`);
        if (!data) return -1;
        const rows: string[][] = data.values || [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === referenceId || rows[i][1] === referenceId) return i + 11;
        }
    } catch {}
    return -1;
}

// ──────────── Helper to encode sheet name for URL ────────────
function encodeSheetNameForUrl(name: string): string {
    return encodeURIComponent(name).replace(/%20/g, ' ');
}

// ──────────── Helper to wrap sheet name in quotes for A1 notation ────────────
function quoteSheetName(name: string): string {
    if (name.includes(' ') || name.includes('.') || name.includes(',') || name.includes('-') || name.includes('/') || name.includes("'")) {
        return `'${name.replace(/'/g, "''")}'`;
    }
    return name;
}

async function getDealerSheetIdByName(sheetName: string): Promise<number | null> {
    try {
        const data = await dealerRead('?fields=sheets.properties.title,sheets.properties.sheetId');
        const target = sanitizeTabName(sheetName);
        const sheet = (data?.sheets || []).find((s: any) => s.properties?.title === target);
        return sheet?.properties?.sheetId ?? null;
    } catch {
        return null;
    }
}

async function removeClosingRows(dealerName: string): Promise<void> {
    const name = sanitizeTabName(dealerName);
    const data = await dealerRead(`/values/${quoteSheetName(name)}!A11:I10000`);
    const rows: any[][] = data?.values || [];

    const rowsToDelete: number[] = [];
    rows.forEach((row, idx) => {
        const rowNo = idx + 11;
        const particulars = String(row[1] || '').toLowerCase();
        const invoiceRef = String(row[2] || '').trim();
        const vchType = String(row[4] || '').toLowerCase();
        if (invoiceRef === 'CL-END' || particulars.includes('closing balance') || vchType === 'closing') {
            rowsToDelete.push(rowNo);
        }
    });

    if (rowsToDelete.length === 0) return;

    const sheetId = await getDealerSheetIdByName(name);
    if (sheetId === null) return;

    const requests = rowsToDelete
        .sort((a, b) => b - a)
        .map(rowNo => ({
            deleteDimension: {
                range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: rowNo - 1,
                    endIndex: rowNo,
                }
            }
        }));

    await dealerWrite(':batchUpdate', 'POST', { requests });
}

async function styleDealerLedgerRows(dealerName: string): Promise<void> {
    const name = sanitizeTabName(dealerName);
    const sheetId = await getDealerSheetIdByName(name);
    if (sheetId === null) return;

    const data = await dealerRead(`/values/${quoteSheetName(name)}!A10:I10000`);
    const rows: any[][] = data?.values || [];
    if (rows.length === 0) return;

    const lastRowNumber = 9 + rows.length;
    const dataStartRowIndex = 10; // row 11
    const dataEndRowIndexExclusive = 10 + Math.max(0, rows.length - 1); // transaction rows only
    let closingRowNumber: number | null = null;
    rows.forEach((row, idx) => {
        const rowNo = idx + 10;
        const particulars = String(row[1] || '').toLowerCase();
        const ref = String(row[2] || '').trim();
        if (ref === 'CL-END' || particulars.includes('closing balance')) {
            closingRowNumber = rowNo;
        }
    });

    const requests: any[] = [
        // Reset ledger body background first so stale highlights do not persist across resyncs.
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 9, endRowIndex: 10000, startColumnIndex: 0, endColumnIndex: 9 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 1, green: 1, blue: 1 }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor)'
            }
        },
        // Opening balance row (row 10) highlight
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 9 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.87, green: 0.925, blue: 0.83 },
                        textFormat: { bold: true, foregroundColor: { red: 0, green: 0, blue: 0 } },
                        horizontalAlignment: 'CENTER'
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
        },
    ];

    if (dataEndRowIndexExclusive > dataStartRowIndex) {
        requests.push(
            // Center key ledger columns (Date and voucher columns)
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: dataStartRowIndex, endRowIndex: dataEndRowIndexExclusive, startColumnIndex: 0, endColumnIndex: 1 },
                    cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
                    fields: 'userEnteredFormat(horizontalAlignment)'
                }
            },
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: dataStartRowIndex, endRowIndex: dataEndRowIndexExclusive, startColumnIndex: 2, endColumnIndex: 5 },
                    cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
                    fields: 'userEnteredFormat(horizontalAlignment)'
                }
            },
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: dataStartRowIndex, endRowIndex: dataEndRowIndexExclusive, startColumnIndex: 8, endColumnIndex: 9 },
                    cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
                    fields: 'userEnteredFormat(horizontalAlignment)'
                }
            },
            // Vch Type bold
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: dataStartRowIndex, endRowIndex: dataEndRowIndexExclusive, startColumnIndex: 4, endColumnIndex: 5 },
                    cell: { userEnteredFormat: { textFormat: { bold: true } } },
                    fields: 'userEnteredFormat(textFormat.bold)'
                }
            },
            // Sales column in red + bold
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: dataStartRowIndex, endRowIndex: dataEndRowIndexExclusive, startColumnIndex: 5, endColumnIndex: 6 },
                    cell: {
                        userEnteredFormat: {
                            textFormat: { bold: true, foregroundColor: { red: 0.8, green: 0, blue: 0 } },
                            horizontalAlignment: 'CENTER'
                        }
                    },
                    fields: 'userEnteredFormat(textFormat,horizontalAlignment)'
                }
            },
            // Receipt column in green + bold
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: dataStartRowIndex, endRowIndex: dataEndRowIndexExclusive, startColumnIndex: 6, endColumnIndex: 7 },
                    cell: {
                        userEnteredFormat: {
                            textFormat: { bold: true, foregroundColor: { red: 0, green: 0.5, blue: 0 } },
                            horizontalAlignment: 'CENTER'
                        }
                    },
                    fields: 'userEnteredFormat(textFormat,horizontalAlignment)'
                }
            }
        );
    }

    if (closingRowNumber !== null) {
        requests.push({
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: closingRowNumber - 1,
                    endRowIndex: closingRowNumber,
                    startColumnIndex: 0,
                    endColumnIndex: 9,
                },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 1, green: 0.95, blue: 0.8 },
                        textFormat: { bold: true, foregroundColor: { red: 0.25, green: 0.25, blue: 0.25 } },
                        horizontalAlignment: 'CENTER'
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
        });
    }

    if (requests.length > 0) {
        await dealerWrite(':batchUpdate', 'POST', { requests });
    }
}

async function appendClosingRow(dealerName: string, runningBalance: number, dateValue?: any, createdAtValue?: any): Promise<void> {
    const name = sanitizeTabName(dealerName);
    const quotedName = quoteSheetName(name);
    const balanceAbs = formatAmount(Math.abs(runningBalance));
    const balanceType = runningBalance >= 0 ? 'Dr' : 'Cr';
    const parsedDate = dateValue ? new Date(dateValue) : new Date();
    const safeDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const parsedCreated = createdAtValue ? new Date(createdAtValue) : safeDate;
    const safeCreatedAt = isNaN(parsedCreated.getTime()) ? safeDate : parsedCreated;
    const closingDateTime = formatTxnDateTime(safeDate, safeCreatedAt);

    await dealerWrite(
        `/values/${quotedName}!A11:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        'POST',
        {
            values: [[closingDateTime, 'Closing Balance', 'CL-END', '', 'Closing', '', '', balanceAbs, balanceType]]
        }
    );
}

// ──────────── Clear dealer transactions ────────────
export async function clearDealerTransactionsForSync(dealerName: string): Promise<void> {
    const name = sanitizeTabName(dealerName);

    // Clear the cache - we'll rebuild on write
    Object.keys(dealerReadCache).forEach(k => {
        if (k.includes(name)) delete dealerReadCache[k];
    });

    // Hard clear all transaction rows so manual/full sync is truly self-healing.
    await dealerWrite('/values:batchClear', 'POST', {
        ranges: [`${quoteSheetName(name)}!A11:I10000`]
    });

    console.log(`[SheetsDealers] Cleared transaction rows for ${name}`);
}

// ──────────── Bulk sync dealers to index sheet ────────────
export async function bulkSyncDealersToSheet(dealers: Dealer[]): Promise<boolean> {
    try {
        await ensureIndexTabExists();
        const rows = dealers.map(dealerToRow);
        await dealerWrite(`/values/${DEALERS_SHEET_NAME}!A1:L1?valueInputOption=USER_ENTERED`, 'PUT', { values: [DEALER_HEADERS] });
        await dealerWrite(`/values/${DEALERS_SHEET_NAME}!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, 'POST', { values: rows });
        return true;
    } catch (e) {
        console.error('[SheetsDealers] Bulk sync fail:', e);
        return false;
    }
}

// ──────────── Bulk create dealer tabs ────────────
export async function bulkCreateDealerTabs(dealers: Dealer[], companyInfo?: any): Promise<{ created: number; skipped: number }> {
    let created = 0, skipped = 0;
    const knownTabs = getKnownTabs();
    for (const dealer of dealers) {
        const tabName = sanitizeTabName(dealer.businessName);
        if (knownTabs.has(tabName.toLowerCase())) {
            skipped++;
        } else {
            await initializeDealerLedger(dealer, companyInfo);
            created++;
        }
    }
    return { created, skipped };
}

// ──────────── Fetch raw dealers from Tally export sheet ────────────
export async function fetchRefinedDealersRaw(): Promise<any[]> {
    try {
        const data = await dealerRead(`/values/${quoteSheetName('refined dealers')}!A:E`);
        if (!data) return [];
        const rows: string[][] = data.values || [];
        if (rows.length <= 1) return [];
        return rows.slice(1).map(r => ({
            businessName: (r[0] || '').trim(),
            address: (r[1] || '').trim(),
            gstNumber: (r[2] || '').trim(),
            phone: (r[3] || '').trim(),
        }));
    } catch (e) {
        console.error('[SheetsDealers] Fetch raw fail:', e);
        return [];
    }
}

// ──────────── Parse Tally ledger vouchers ────────────
export async function parseTallyLedgers(): Promise<any[]> {
    try {
        const data = await dealerRead(`/values/${quoteSheetName('Ledger Vouchers')}!A:G`);
        if (!data) return [];
        const rows: string[][] = data.values || [];
        const dealersList: any[] = [];
        let currentDealer: any = null;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const colA = (row[0] || '').toString().trim();
            const colB = (row[1] || '').toString().trim();
            if (colA === 'Ledger:') {
                currentDealer = { businessName: colB, address: '', gstNumber: '', phone: '', balance: 0 };
                const nextRow = rows[i + 1] || [];
                const infoStr = (nextRow[1] || '').toString();
                if (infoStr && !infoStr.toLowerCase().includes('date')) {
                    const gstMatch = infoStr.match(/GST\.NO\s*:\s*([0-9A-Z]{15})/i);
                    if (gstMatch) currentDealer.gstNumber = gstMatch[1];
                    const phoneMatch = infoStr.match(/(?:CELL|PHONE|MOB)\s*:\s*(\d+)/i) || infoStr.match(/\d{10}/);
                    if (phoneMatch) currentDealer.phone = phoneMatch[1] || phoneMatch[0];
                    currentDealer.address = infoStr.split(/GST\.NO|CELL|PHONE|MOB/i)[0].replace(/,$/, '').trim();
                }
            }
            if (currentDealer && (colB.toLowerCase().includes('closing balance') || colA.toLowerCase().includes('closing balance'))) {
                const debit = parseFloat((row[5] || '0').toString().replace(/,/g, ''));
                const credit = parseFloat((row[6] || '0').toString().replace(/,/g, ''));
                currentDealer.balance = debit - credit;
                dealersList.push({ ...currentDealer });
                currentDealer = null;
            }
        }
        return dealersList;
    } catch (e) {
        console.error('[SheetsDealers] Failed to parse Tally ledgers:', e);
        return [];
    }
}

// ──────────── Remove dealer ────────────
export async function removeDealerFromSheet(id: string, businessName: string): Promise<boolean> {
    const rowIndex = await findDealerRowById(id);
    if (rowIndex > 0) {
        const empty = Array(12).fill('');
        await dealerWrite(
            `/values/${DEALERS_SHEET_NAME}!A${rowIndex}:L${rowIndex}?valueInputOption=USER_ENTERED`,
            'PUT', { values: [empty] }
        );
    }
    if (businessName) await deleteDealerSheet(businessName);
    return true;
}

// ──────────── Delete all tabs except given list ────────────
export async function deleteAllTabsExcept(keepTabs: string[]): Promise<number> {
    try {
        const data = await dealerRead('?fields=sheets.properties.title,sheets.properties.sheetId,sheets.properties.index');
        if (!data) return 0;
        const allSheets = (data.sheets || [])
            .map((s: any) => ({ title: s.properties.title as string, sheetId: s.properties.sheetId as number, index: s.properties.index as number }))
            .sort((a: any, b: any) => b.index - a.index);
        const toDelete = allSheets.filter((s: any) => !keepTabs.includes(s.title));
        for (const sheet of toDelete) {
            await dealerWrite(':batchUpdate', 'POST', {
                requests: [{ deleteSheet: { sheetId: sheet.sheetId } }]
            });
        }
        return toDelete.length;
    } catch (e) {
        console.error('[SheetsDealers] deleteAllTabsExcept failed:', e);
        return 0;
    }
}

// ──────────── Ledger Health Check ────────────
// Validates dealer ledger structure and returns any issues found
export interface LedgerHealthCheckResult {
    healthy: boolean;
    issues: string[];
    stats: {
        openingBalanceCount: number;
        transactionCount: number;
        closingBalanceCount: number;
        duplicateRefs: number;
    };
}

export async function validateDealerLedger(dealerName: string): Promise<LedgerHealthCheckResult> {
    const name = sanitizeTabName(dealerName);
    const issues: string[] = [];
    const stats = {
        openingBalanceCount: 0,
        transactionCount: 0,
        closingBalanceCount: 0,
        duplicateRefs: 0,
    };

    try {
        // Read all rows from the dealer's ledger tab (starting from row 10 where data begins)
        const data = await dealerRead(`/values/${quoteSheetName(name)}!A10:I500`);
        if (!data || !data.values || data.values.length === 0) {
            return { healthy: false, issues: ['Ledger sheet is empty or missing'], stats };
        }

        const rows = data.values;
        const seenRefs = new Set<string>();

        // Check header row (should be row 9, index 0 in this range)
        const headerRow = rows[0];
        if (!headerRow || headerRow[0] !== 'Date') {
            issues.push('Ledger header is missing or corrupted');
        }

        // Analyze data rows (skip header, start from index 1)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const date = (row[0] || '').toString().trim();
            const particulars = (row[1] || '').toString().toLowerCase();
            const invoiceNo = (row[2] || '').toString().trim();
            const receiptNo = (row[3] || '').toString().trim();
            const balance = (row[7] || '').toString().trim();

            // Skip empty rows
            if (!date && !particulars) continue;

            // Check for opening balance
            if (particulars.includes('opening balance')) {
                stats.openingBalanceCount++;
                if (stats.openingBalanceCount > 1) {
                    issues.push(`Multiple opening balance rows found (row ${i + 10})`);
                }
                continue;
            }

            // Check for closing balance
            if (particulars.includes('closing balance') || particulars.includes('carried forward')) {
                stats.closingBalanceCount++;
                continue;
            }

            // This is a transaction row
            stats.transactionCount++;

            // Check for duplicate references
            const ref = invoiceNo || receiptNo;
            if (ref) {
                if (seenRefs.has(ref)) {
                    stats.duplicateRefs++;
                    issues.push(`Duplicate transaction reference: ${ref} (row ${i + 10})`);
                }
                seenRefs.add(ref);
            }

            // Check for problematic balance column in transaction rows
            // Under new architecture, balance column (H) should be empty for transactions
            if (balance && balance !== '' && !particulars.includes('opening') && !particulars.includes('closing')) {
                // This is a warning - existing sheets may have old data
                console.warn(`[SheetsDealers] Legacy balance data found in transaction row ${i + 10}: ${balance}`);
            }
        }

        // Validate opening balance count
        if (stats.openingBalanceCount === 0) {
            issues.push('No opening balance row found - ledger may not be properly initialized');
        }

        return {
            healthy: issues.length === 0,
            issues,
            stats,
        };
    } catch (e) {
        console.error(`[SheetsDealers] Health check failed for ${name}:`, e);
        return {
            healthy: false,
            issues: [`Failed to read ledger: ${e}`],
            stats,
        };
    }
}

// ──────────── Rebuild Dealer Ledger (Clean Rebuild) ────────────
export async function rebuildDealerLedger(
    dealer: Dealer,
    transactions: any[],
    companyInfo?: any
): Promise<boolean> {
    const name = sanitizeTabName(dealer.businessName);
    console.log(`[SheetsDealers] Rebuilding ledger for ${dealer.businessName}`);

    try {
        // Step 1: Clear all transaction rows (keep header rows 1-10)
        await clearDealerTransactionsForSync(name);

        // Step 2: Re-write header + opening balance (rows 1-11)
        await initializeDealerLedger(dealer, companyInfo);

        // Step 3: Batch write all transactions (no running balance)
        if (transactions && transactions.length > 0) {
            await batchWriteTransactionsToDealerSheet(dealer.businessName, transactions);
        }

        console.log(`[SheetsDealers] Successfully rebuilt ledger for ${dealer.businessName}`);
        return true;
    } catch (e) {
        console.error(`[SheetsDealers] Failed to rebuild ledger for ${dealer.businessName}:`, e);
        return false;
    }
}
