/**
 * Google Sheets Writer Service  (quota-safe version)
 *
 * ALL WRITES  → go through sheetsQueue (localStorage queue, flushed at ≤30 writes/min)
 * ALL READS   → served from 5-min in-memory cache; real API only when cache is cold or forced
 *
 * The UI receives instant feedback from localStorage / in-memory state.
 * Google Sheets is eventually-consistent — it will catch up within seconds.
 */

import { Product } from '@/types';
import { enqueueOp, cachedRead, clearReadCache } from './sheetsQueue';
import { invalidateLocalCache as invalidateProductsLocalCache } from './googleSheetProducts';

const SPREADSHEET_ID = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID || '1ksFhdJK6-sQxVBIkqqJdRKPhm--_SfzpJeuC2GHR2y0';
const SHEET_NAME = process.env.NEXT_PUBLIC_GOOGLE_SHEET_TAB_NAME || 'CurrentProducts';
const HEADER_ROW = ['Product ID','Product Name','HSN Code','Unit','Cost Price','Selling Price','GST%','Stock','Category'];

// ──────────── In-memory product cache ────────────
let productsCache: { products: Product[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

export function invalidateProductsCache(): void {
    productsCache = null;
    clearReadCache();
    invalidateProductsLocalCache(); // Also clear the product service's in-memory and local storage cache
    console.log('[SheetsWriter] Product cache invalidated');
}

// ──────────── Helpers ────────────
function productToRow(product: Product | any): string[] {
    let gst = parseFloat(product.gstRate || 0);
    if (gst > 0 && gst < 1) gst = gst * 100;
    return [
        product.productId || product.id || '',
        product.name || '',
        product.hsnCode || '',
        product.unit || 'nos',
        String(product.costPrice || 0),
        String(product.price || 0),
        String(gst),
        String(product.stock || 0),
        product.category || 'General',
    ];
}

// ──────────── READ — served from cache, real API only when needed ────────────
export async function readProductsFromSheet(forceRefresh = false): Promise<{ products: Product[]; format: string }> {
    // 1. Return in-memory cache if fresh
    if (!forceRefresh && productsCache && (Date.now() - productsCache.timestamp) < CACHE_TTL_MS) {
        console.log('[SheetsWriter] Serving products from memory cache');
        return { products: productsCache.products, format: 'cached' };
    }

    // 2. Also check localStorage cache written by googleSheetProducts.ts
    if (!forceRefresh) {
        try {
            const local = localStorage.getItem('sve_products');
            const ts    = parseInt(localStorage.getItem('sve_products_cache_ts') || '0', 10);
            if (local && Date.now() - ts < CACHE_TTL_MS) {
                const products: Product[] = JSON.parse(local);
                if (products.length > 0) {
                    productsCache = { products, timestamp: ts };
                    console.log('[SheetsWriter] Serving products from localStorage cache');
                    return { products, format: 'local-cache' };
                }
            }
        } catch {}
    }

    // 3. Hit the real API (rate-limited via cachedRead)
    try {
        const data = await cachedRead(`/values/${SHEET_NAME}!A:I`);
        const rows: string[][] = data.values || [];
        if (rows.length === 0) return { products: [], format: 'empty' };

        // 4. Find header row (search first 10 rows for standard keywords)
        let headerIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const lower = (rows[i] || []).map((c: string) => (c || '').toLowerCase().trim());
            if (lower.some((c: string) => c.includes('product name') || c.includes('product id') || (c.includes('selling') && c.includes('price')))) {
                headerIndex = i;
                break;
            }
        }

        const headers = headerIndex >= 0 ? 
            (rows[headerIndex] || []).map((c: string) => (c || '').toLowerCase().trim()) : 
            [];

        const col = headerIndex >= 0 ? {
            productId: headers.findIndex(h => h.includes('product id')),
            name:      headers.findIndex(h => h.includes('product name') || h === 'name'),
            hsn:       headers.findIndex(h => h.includes('hsn')),
            unit:      headers.findIndex(h => h === 'unit' || (h.includes('unit') && !h.includes('cost'))),
            cost:      headers.findIndex(h => h.includes('cost')),
            price:     headers.findIndex(h => (h.includes('selling') || h.includes('sell')) || (h.includes('price') && !h.includes('cost'))),
            gst:       headers.findIndex(h => h.includes('gst')),
            stock:     headers.findIndex(h => h.includes('stock')),
            category:  headers.findIndex(h => h === 'category' || (h.includes('category') && !h.includes('unit'))),
        } : {
            // FALLBACK MAPPING (based on detected user layout: A=ID, B=Name, C=HSN, D=Unit, E=Cost, F=Price, G=GST, H=Stock, I=Category)
            productId: 0, name: 1, hsn: 2, unit: 3, cost: 4, price: 5, gst: 6, stock: 7, category: 8
        };

        const parseNum = (v: any) => {
            if (v === undefined || v === null) return 0;
            const s = String(v).replace(/[^0-9.-]/g, '');
            return parseFloat(s) || 0;
        };
        
        const products: Product[] = [];
        let num = 1;

        // 5. Build products array
        const startRow = headerIndex >= 0 ? headerIndex + 1 : 0;
        for (let i = startRow; i < rows.length; i++) {
            const row = rows[i] || [];
            const name = col.name >= 0 ? (row[col.name] || '').trim() : '';
            if (!name) continue;

            // Skip title rows/category-only rows (detect by missing unit/price/id or starting with "RAJA" etc.)
            const idValue = col.productId >= 0 ? (row[col.productId] || '').trim() : '';
            const unitValue = col.unit >= 0 ? (row[col.unit] || '').trim().toLowerCase() : '';
            
            // Heuristic for data-row: must have a unit OR a numeric ID OR a price
            const isDataRow = (unitValue && unitValue.length <= 4) || 
                              (idValue && (idValue.startsWith('P') || /\d/.test(idValue))) ||
                              (col.price >= 0 && parseNum(row[col.price]) > 0);
            
            if (!isDataRow) continue;

            const productId = idValue || `P${String(num).padStart(3,'0')}`;
            const rawGst = col.gst >= 0 ? parseNum(row[col.gst]) : 0;
            const gstRate = rawGst > 0 && rawGst < 1 ? rawGst * 100 : rawGst;

            products.push({
                id: productId, productId, name,
                category:  col.category >= 0 ? (row[col.category] || '').trim() || 'General' : 'General',
                unit:      col.unit     >= 0 ? (row[col.unit]     || '').trim() || 'nos'     : 'nos',
                hsnCode:   col.hsn      >= 0 ? (row[col.hsn]      || '').trim()              : '',
                costPrice: col.cost     >= 0 ? parseNum(row[col.cost])                       : 0,
                price:     col.price    >= 0 ? parseNum(row[col.price])                      : 0,
                gstRate,
                stock:     col.stock    >= 0 ? parseFloat(String(row[col.stock]).replace(/[^0-9.-]/g,'')) || 0 : 0,
                rowIndex: i + 1,
            } as Product & { rowIndex: number });
            num++;
        }

        productsCache = { products, timestamp: Date.now() };
        // Keep localStorage cache in sync
        localStorage.setItem('sve_products', JSON.stringify(products));
        localStorage.setItem('sve_products_cache_ts', String(Date.now()));
        localStorage.setItem('sve_products_tab', SHEET_NAME);

        console.log('[SheetsWriter] Loaded', products.length, 'products from API');
        return { products, format: 'structured' };

    } catch (err: any) {
        // On 429 or any error, fall back to localStorage
        console.warn('[SheetsWriter] API read failed, serving localStorage fallback:', err.message);
        try {
            const local = localStorage.getItem('sve_products');
            if (local) {
                const products: Product[] = JSON.parse(local);
                return { products, format: 'fallback' };
            }
        } catch {}
        throw err;
    }
}

// ──────────── WRITES — fire-and-forget via queue ────────────

/** Add a new product. UI updates immediately; sheet write is queued. */
export async function addProductToSheet(product: Product | any): Promise<boolean> {
    try {
        const row = productToRow(product);
        // Simple append — safest for quota (no extra reads needed)
        enqueueOp(
            `/values/${SHEET_NAME}!A:Z:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST',
            { values: [row] }
        );
        invalidateProductsCache();
        console.log('[SheetsWriter] Product queued for add:', product.name);
        return true;
    } catch (err: any) {
        console.error('[SheetsWriter] Failed to queue product add:', err.message);
        return false;
    }
}

/** Update an existing product row. rowIndex is required for a direct update; */
export async function updateProductInSheet(rowIndex: number, product: Product | any): Promise<boolean> {
    try {
        if (rowIndex > 0) {
            enqueueOp(
                `/values/${SHEET_NAME}!A${rowIndex}:I${rowIndex}?valueInputOption=USER_ENTERED`,
                'PUT',
                { values: [productToRow(product)] }
            );
        } else {
            // No rowIndex — queue an append (safe fallback)
            enqueueOp(
                `/values/${SHEET_NAME}!A:Z:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
                'POST',
                { values: [productToRow(product)] }
            );
        }
        invalidateProductsCache();
        console.log('[SheetsWriter] Product queued for update:', product.name);
        return true;
    } catch (err: any) {
        console.error('[SheetsWriter] Failed to queue product update:', err.message);
        return false;
    }
}

/** Delete a product row from the sheet (queued as a blank-row clear; physical delete not queued to avoid row-shift issues). */
export async function deleteProductFromSheet(rowIndex: number, productName?: string): Promise<boolean> {
    try {
        if (rowIndex > 0) {
            // Clear the row contents (safe, no row-shift)
            const empty = Array(9).fill('');
            enqueueOp(
                `/values/${SHEET_NAME}!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`,
                'PUT',
                { values: [empty] }
            );
            console.log('[SheetsWriter] Product deletion queued (row cleared):', productName, 'row', rowIndex);
        } else {
            console.warn('[SheetsWriter] deleteProductFromSheet: no rowIndex, skip sheet delete for', productName);
        }
        invalidateProductsCache();
        return true;
    } catch (err: any) {
        console.error('[SheetsWriter] Failed to queue product delete:', err.message);
        return false;
    }
}

// ──────────── Generic queued append (used by logs, invoices, payments) ────────────
export async function appendRowsToSheet(sheetName: string, rows: any[][], isLog = false): Promise<boolean> {
    try {
        enqueueOp(
            `/values/${sheetName}!A:Z:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            'POST',
            { values: rows },
            isLog
        );
        return true;
    } catch (err: any) {
        console.error(`[SheetsWriter] Failed to queue append to ${sheetName}:`, err.message);
        return false;
    }
}

// ──────────── Invoice / Payment sync (queued) ────────────
export async function syncInvoiceToSheets(dealerName: string, invoiceId: string, amount: number, date: string, items: any[]): Promise<boolean> {
    const row = [
        new Date().toISOString(), dealerName, invoiceId, date,
        String(amount),
        JSON.stringify(items.map(i => `${i.productName} (x${i.quantity})`)),
    ];
    return appendRowsToSheet('ERP Invoices', [row]);
}

export async function syncPaymentToSheets(dealerName: string, receiptId: string, amount: number, method: string, agent: string): Promise<boolean> {
    const row = [new Date().toISOString(), dealerName, receiptId, String(amount), method, agent];
    return appendRowsToSheet('ERP Payments', [row]);
}

// ──────────── Row helpers (still needed by some callers) ────────────
export async function findRowByValue(sheetName: string, columnIndex: number, value: string): Promise<number> {
    try {
        const colLetter = String.fromCharCode(65 + columnIndex);
        const data = await cachedRead(`/values/${sheetName}!${colLetter}:${colLetter}`);
        const rows: string[][] = data.values || [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0]?.trim() === value?.trim()) return i + 1;
        }
        return -1;
    } catch (e) {
        console.error(`[SheetsWriter] findRowByValue failed for ${sheetName}:`, e);
        return -1;
    }
}

export async function updateRowInSheet(sheetName: string, rowIndex: number, rowData: any[], isLog = false): Promise<boolean> {
    enqueueOp(
        `/values/${sheetName}!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`,
        'PUT',
        { values: [rowData] },
        isLog
    );
    return true;
}

export async function clearRowInSheet(sheetName: string, rowIndex: number, columnCount = 10): Promise<boolean> {
    const lastCol = String.fromCharCode(64 + columnCount);
    enqueueOp(
        `/values/${sheetName}!A${rowIndex}:${lastCol}${rowIndex}?valueInputOption=USER_ENTERED`,
        'PUT',
        { values: [Array(columnCount).fill('')] }
    );
    return true;
}

// ──────────── Tab management (direct calls — one-off operations) ────────────
export async function ensureTabExistsWithName(name: string, headerRow?: string[], isLog = false): Promise<void> {
    // Queued as a batchUpdate — if it fails it will be retried
    // We skip the "check if tab exists" read to save quota; the API will do nothing if tab already exists
    // Actually we enqueue a read-check + create as a no-op guard via a separate queue entry
    // Simplest: just try to create, ignore "already exists" error in queue processor
    enqueueOp(
        ':batchUpdate',
        'POST',
        { requests: [{ addSheet: { properties: { title: name } } }] },
        isLog
    );
    if (headerRow && headerRow.length > 0) {
        const lastCol = String.fromCharCode(64 + headerRow.length);
        enqueueOp(
            `/values/${name}!A1:${lastCol}1?valueInputOption=USER_ENTERED`,
            'PUT',
            { values: [headerRow] },
            isLog
        );
    }
}

// ──────────── Application Log (queued append to log spreadsheet) ────────────
export async function logToApplicationSheet(action: string, details: string, amount = 0): Promise<boolean> {
    try {
        const now = new Date();
        const date = now.toLocaleDateString('en-IN', { timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' }).split('/').reverse().join('-');
        const time = now.toLocaleTimeString('en-IN', { timeZone:'Asia/Kolkata', hour12:true });
        let platform = 'WEB';
        if (typeof window !== 'undefined') {
            if ((window as any).electron) platform = 'DESKTOP';
            else if (/Android|webOS|iPhone|iPad/i.test(navigator.userAgent)) platform = 'MOBILE';
        }
        const row = [date, time, platform, action, details, amount === 0 ? '' : String(amount)];
        return appendRowsToSheet('Application Log', [row], true);
    } catch (err: any) {
        console.error('[SheetsWriter] logToApplicationSheet failed:', err.message);
        return false;
    }
}

// ──────────── Test connection ────────────
export async function testSheetConnection(): Promise<{ success: boolean; message: string }> {
    try {
        const data = await cachedRead(`/values/${SHEET_NAME}!A1:A1`);
        return { success: true, message: `Connected! First cell: ${data.values?.[0]?.[0] || '(empty)'}` };
    } catch (err: any) {
        return { success: false, message: err.message };
    }
}
