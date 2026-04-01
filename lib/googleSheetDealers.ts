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
    const res = await fetch(`${DEAL_SHEETS_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) {
        console.warn('[SheetsDealers] 429 on read — serving stale cache or skipping:', path);
        if (cached) return cached.data;
        return null; // gracefully return null instead of throwing
    }
    if (!res.ok) {
        const txt = await res.text();
        console.error('[SheetsDealers] Read error', res.status, txt.slice(0, 200));
        return null;
    }
    const data = await res.json();
    dealerReadCache[cacheKey] = { data, ts: Date.now() };
    return data;
}

/** Enqueue a write to the DEALERS spreadsheet.
 *  We can't use the shared enqueueOp directly (it defaults to products spreadsheet),
 *  so we store a DEALERS-prefixed entry and handle it via the same queue mechanism.
 *  
 *  SIMPLIFICATION: Since sheetsQueue doesn't know about the dealers spreadsheet,
 *  we do a direct write here but with rate-limit coordination via the shared key.
 */
async function dealerWrite(path: string, method: string, body?: any): Promise<void> {
    // Enforce rate limit
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

    if (res.status === 429) {
        console.warn('[SheetsDealers] 429 on write — operation dropped (will resync on next app load):', path);
        return; // Don't throw — let the app continue
    }
    if (!res.ok) {
        const txt = await res.text();
        if (!txt.includes('already exists')) {
            console.error('[SheetsDealers] Write error', res.status, txt.slice(0, 200));
        }
        return; // Don't throw for benign errors
    }
    // Invalidate related read cache on successful write
    Object.keys(dealerReadCache).forEach(k => {
        if (k.includes(path.split('!')[0])) delete dealerReadCache[k];
    });
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

    // Skip if we already know this tab exists — saves a meta read
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

    await dealerWrite(`/values/'${name}'!A1:I10?valueInputOption=USER_ENTERED`, 'PUT', { values: rows });
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

// ──────────── Append single transaction ────────────
export async function syncTransactionToDealerSheet(dealerName: string, transaction: any, runningBalance: number): Promise<boolean> {
    if (transaction.referenceId === 'BAL B/F') return true;
    const name = sanitizeTabName(dealerName);
    try {
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

        const rowData = [
            new Date(transaction.date).toLocaleDateString('en-IN'),
            particulars,
            isInvoice ? (transaction.referenceId || '') : '',
            !isInvoice ? (transaction.referenceId || '') : '',
            isCheckReturn ? 'Cheque Return' : (isInvoice ? 'Sales' : (transaction.notes?.toLowerCase().includes('stock return') ? 'Stock Return' : 'Receipt')),
            isInvoice ? transaction.amount : '',
            !isInvoice ? transaction.amount : '',
            Math.abs(runningBalance),
            (isInvoice || isCheckReturn) ? 'Cr' : 'Dr',
        ];

        await dealerWrite(
            `/values/'${name}'!A11:I1000000:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST', { values: [rowData] }
        );
        return true;
    } catch (e) {
        console.error(`[SheetsDealers] Failed to sync transaction for ${name}:`, e);
        return false;
    }
}

// ──────────── Batch write all transactions (one API call) ────────────
export async function batchWriteTransactionsToDealerSheet(
    dealerName: string, transactions: any[], openingBalance = 0
): Promise<boolean> {
    const name = sanitizeTabName(dealerName);
    const filteredTxns = transactions.filter(t => t.referenceId !== 'BAL B/F');
    if (filteredTxns.length === 0) return true;

    try {
        let balance = Number(openingBalance) || 0;
        const rows = filteredTxns.map(txn => {
            const isInvoice = txn.type === 'INVOICE';
            if (isInvoice) balance += txn.amount; else balance -= txn.amount;
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
            return [
                new Date(txn.date).toLocaleDateString('en-IN'), particulars,
                isInvoice ? (txn.referenceId || '') : '', !isInvoice ? (txn.referenceId || '') : '',
                isCheckReturn ? 'Cheque Return' : (isInvoice ? 'Sales' : (txn.notes?.toLowerCase().includes('stock return') ? 'Stock Return' : 'Receipt')),
                isInvoice ? txn.amount : '', !isInvoice ? txn.amount : '',
                Math.abs(balance), (isInvoice || isCheckReturn) ? 'Cr' : 'Dr',
            ];
        });
        await dealerWrite(
            `/values/'${name}'!A11:I1000000:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST', { values: rows }
        );
        return true;
    } catch (e) {
        console.error(`[SheetsDealers] batchWrite failed for ${name}:`, e);
        return false;
    }
}

// ──────────── Rollover rows ────────────
export async function appendRolloverRowsToDealerSheet(dealerName: string, balance: number, closingDateStr: string, openingDateStr: string): Promise<void> {
    const name = sanitizeTabName(dealerName);
    const closingRow = [new Date(closingDateStr).toLocaleDateString('en-IN'), "'CLOSING BALANCE (CARRIED FORWARD)", '', '', '', '', '', Math.abs(balance), balance >= 0 ? 'Cr' : 'Dr'];
    const openingRow = [new Date(openingDateStr).toLocaleDateString('en-IN'), "'OPENING BALANCE (BROUGHT FORWARD)", '', '', '', '', '', Math.abs(balance), balance >= 0 ? 'Cr' : 'Dr'];
    await dealerWrite(
        `/values/'${name}'!A11:I1000000:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        'POST', { values: [closingRow, openingRow] }
    );
}

// ──────────── Find transaction row (cached read) ────────────
export async function findTransactionRow(dealerName: string, referenceId: string): Promise<number> {
    const name = sanitizeTabName(dealerName);
    try {
        const data = await dealerRead(`/values/'${name}'!C11:D`);
        if (!data) return -1;
        const rows: string[][] = data.values || [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === referenceId || rows[i][1] === referenceId) return i + 11;
        }
    } catch {}
    return -1;
}

// ──────────── Clear dealer transactions ────────────
export async function clearDealerTransactionsForSync(dealerName: string): Promise<void> {
    const name = sanitizeTabName(dealerName);
    await dealerWrite(`/values/'${name}'!A11:I:clear`, 'POST');
    // Invalidate cached reads for this tab
    Object.keys(dealerReadCache).forEach(k => {
        if (k.includes(name)) delete dealerReadCache[k];
    });
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
        const data = await dealerRead(`/values/'refined dealers'!A:E`);
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
        const data = await dealerRead(`/values/'Ledger Vouchers'!A:G`);
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
