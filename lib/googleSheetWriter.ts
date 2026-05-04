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
const HEADER_ROW = ['Product ID','Product Name','HSN Code','Unit','Cost Price','Selling Price','GST%','Stock','Category','Avg Cost','Inventory Value'];

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
        String(product.avgCost || product.costPrice || 0),       // Col J — Avg Cost
        String(product.inventoryValue || 0),                      // Col K — Inventory Value
    ];
}

// Tab names for transaction logs
const PURCHASES_LOG_TAB = 'Purchases';
const SALES_LOG_TAB = 'Sales';
const SALES_TRACKING_TAB = 'Sales_Tracking';

const PURCHASES_HEADER = ['Timestamp', 'PurchaseId', 'Supplier', 'ProductId', 'ProductName', 'Qty', 'UnitCost', 'TotalCost', 'StockBefore', 'StockAfter', 'AvgCostAfter', 'InventoryValueAfter'];
const SALES_HEADER = ['Timestamp', 'InvoiceId', 'Dealer', 'ProductId', 'ProductName', 'Qty', 'UnitPrice', 'AvgCostAtSale', 'COGS', 'StockBefore', 'StockAfter', 'InventoryValueAfter'];
const SALES_TRACKING_HEADER = ['TimeStamp', 'Invoice No.', 'dealerName', 'Product ID', 'productName', 'Stock'];

// ── Track which log tabs have been initialized this session (avoids queue dedup collision) ──
const INITIALIZED_TABS_KEY = 'sve_initialized_log_tabs';

function isTabInitialized(name: string): boolean {
    try {
        const list: string[] = JSON.parse(localStorage.getItem(INITIALIZED_TABS_KEY) || '[]');
        return list.includes(name);
    } catch { return false; }
}

function markTabInitialized(name: string): void {
    try {
        const list: string[] = JSON.parse(localStorage.getItem(INITIALIZED_TABS_KEY) || '[]');
        if (!list.includes(name)) {
            list.push(name);
            localStorage.setItem(INITIALIZED_TABS_KEY, JSON.stringify(list));
        }
    } catch {}
}

/** Ensure the Purchases log tab exists with its header row (safe to call multiple times). */
export function ensurePurchasesTabExists(): void {
    ensureTabExistsWithName(PURCHASES_LOG_TAB, PURCHASES_HEADER, true);
}

/** Ensure the Sales log tab exists with its header row (safe to call multiple times). */
export function ensureSalesTabExists(): void {
    ensureTabExistsWithName(SALES_LOG_TAB, SALES_HEADER, true);
}

/** Ensure the Sales_Tracking tab exists with its header row (safe to call multiple times). */
export function ensureSalesTrackingTabExists(): void {
    ensureTabExistsWithName(SALES_TRACKING_TAB, SALES_TRACKING_HEADER);
}

/** Log a single purchase line-item to the Purchases tab. */
export function logPurchaseItemToSheet(params: {
    purchaseId: string;
    supplierName: string;
    productId: string;
    productName: string;
    qty: number;
    unitCost: number;
    stockBefore: number;
    stockAfter: number;
    avgCostAfter: number;
    inventoryValueAfter: number;
}): void {
    const row = [
        new Date().toISOString(),
        params.purchaseId,
        params.supplierName,
        params.productId,
        params.productName,
        String(params.qty),
        String(params.unitCost),
        String(params.qty * params.unitCost),
        String(params.stockBefore),
        String(params.stockAfter),
        String(params.avgCostAfter),
        String(params.inventoryValueAfter),
    ];
    enqueueOp(
        `/values/${PURCHASES_LOG_TAB}!A:L:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        'POST',
        { values: [row] },
        true // isLog
    );
}

/** Fetch all tracked items for a specific purchase from the Purchases tab. */
export async function fetchPurchaseItemsByPurchaseId(purchaseId: string): Promise<any[]> {
    try {
        // Force refresh to ensure we see the latest rows for deletion
        const data = await cachedRead(`/values/${PURCHASES_LOG_TAB}!A:L`, true, true); 
        const rows: string[][] = data.values || [];
        if (rows.length <= 1) return [];

        return rows.slice(1)
            .filter(r => r[1] === purchaseId)
            .map(r => ({
                purchaseId: r[1],
                productId: r[3],
                productName: r[4],
                qty: parseFloat(r[5]) || 0,
            }));
    } catch (err) {
        console.warn('[SheetsWriter] Failed to fetch purchase items for', purchaseId, err);
        return [];
    }
}

/** Delete all rows in Purchases tab matching a purchaseId. */
export async function deletePurchaseItemsByPurchaseId(purchaseId: string): Promise<void> {
    try {
        const data = await cachedRead(`/values/${PURCHASES_LOG_TAB}!A:B`, true, true);
        const rows: string[][] = data.values || [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][1] === purchaseId) {
                clearRowInSheet(PURCHASES_LOG_TAB, i + 1, 12, true); 
            }
        }
    } catch (err) {
        console.warn('[SheetsWriter] Failed to delete purchase items for', purchaseId, err);
    }
}

/** Log a single sale line-item to the Sales tab. */
export function logSaleItemToSheet(params: {
    invoiceId: string;
    dealerName: string;
    productId: string;
    productName: string;
    qty: number;
    unitPrice: number;
    avgCostAtSale: number;
    cogs: number;
    stockBefore: number;
    stockAfter: number;
    inventoryValueAfter: number;
}): void {
    const row = [
        new Date().toISOString(),
        params.invoiceId,
        params.dealerName,
        params.productId,
        params.productName,
        String(params.qty),
        String(params.unitPrice),
        String(params.avgCostAtSale),
        String(params.cogs),
        String(params.stockBefore),
        String(params.stockAfter),
        String(params.inventoryValueAfter),
    ];
    enqueueOp(
        `/values/${SALES_LOG_TAB}!A:L:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        'POST',
        { values: [row] },
        true // isLog
    );
}

/** Log multiple line-items to Sales_tracking specifically for reversal logic. 
 * stock is negative for sales, positive for reversals.
 */
export function logSalesItemsToTracking(invoiceId: string, dealerName: string, items: any[], isReversal = false): void {
    if (!items || items.length === 0) return;
    ensureSalesTrackingTabExists();
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const rows = items.map(item => {
        const qty = Number(item.quantity || item.qty || item.stock || 0);
        const movement = isReversal ? Math.abs(qty) : -Math.abs(qty);
        return [
            timestamp,
            invoiceId,
            dealerName,
            item.productId || item.product_id,
            item.productName || item.name,
            String(movement)
        ];
    });
    appendRowsToSheet(SALES_TRACKING_TAB, rows);
}

/** Fetch all tracked items for a specific invoice from Sales_tracking. */
export async function fetchSalesItemsByInvoiceId(invoiceId: string): Promise<any[]> {
    try {
        const data = await cachedRead(`/values/${SALES_TRACKING_TAB}!A:F`);
        const rows: string[][] = data.values || [];
        if (rows.length <= 1) return []; // only header or empty

        return rows.slice(1) // skip header
            .filter(r => r[1] === invoiceId) // invoiceId is now index 1
            .map(r => ({
                timeStamp: r[0],
                invoiceId: r[1],
                dealerName: r[2],
                productId: r[3],
                productName: r[4],
                qty: parseFloat(r[5]) || 0
            }));
    } catch (err) {
        console.warn('[SheetsWriter] Failed to fetch sales tracking for', invoiceId, err);
        return [];
    }
}

/** Delete all rows in Sales_tracking matching an invoiceId. */
export async function deleteSalesItemsByInvoiceId(invoiceId: string): Promise<void> {
    try {
        const data = await cachedRead(`/values/${SALES_TRACKING_TAB}!A:B`);
        const rows: string[][] = data.values || [];
        // We find matching rows and clear them
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][1] === invoiceId) { // Check column B (index 1) for Invoice ID
                clearRowInSheet(SALES_TRACKING_TAB, i + 1, 6); // Clear 6 columns (A-F)
            }
        }
    } catch (err) {
        console.warn('[SheetsWriter] Failed to delete sales tracking for', invoiceId, err);
    }
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
        const data = await cachedRead(`/values/${SHEET_NAME}!A:K`);
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
            cost:      headers.findIndex(h => h.includes('cost price') || (h.includes('cost') && !h.includes('avg'))),
            price:     headers.findIndex(h => (h.includes('selling') || h.includes('sell')) || (h.includes('price') && !h.includes('cost'))),
            gst:       headers.findIndex(h => h.includes('gst')),
            stock:     headers.findIndex(h => h.includes('stock')),
            category:  headers.findIndex(h => h === 'category' || (h.includes('category') && !h.includes('unit'))),
            avgCost:   headers.findIndex(h => h.includes('avg cost') || h === 'avgcost'),
            inventoryValue: headers.findIndex(h => h.includes('inventory value') || h === 'inventoryvalue'),
        } : {
            // FALLBACK MAPPING (based on detected user layout: A=ID, B=Name, C=HSN, D=Unit, E=Cost, F=Price, G=GST, H=Stock, I=Category, J=Avg Cost, K=Inventory Value)
            productId: 0, name: 1, hsn: 2, unit: 3, cost: 4, price: 5, gst: 6, stock: 7, category: 8, avgCost: 9, inventoryValue: 10
        };

        const parseNum = (v: any) => {
            if (v === undefined || v === null) return 0;
            const s = String(v).replace(/[^0-9.-]/g, '');
            return parseFloat(s) || 0;
        };
        
        const products: Product[] = [];
        let num = 1;

        // 5. Build products array
        // Explicitly start from the 4th row (index 3) as requested
        const startRow = 3;
        for (let i = startRow; i < rows.length; i++) {
            const row = rows[i] || [];
            
            // User requested: Extract only rows where productId is NOT empty
            const idValue = col.productId >= 0 ? (row[col.productId] || '').trim() : '';
            if (!idValue) continue;

            const name = col.name >= 0 ? (row[col.name] || '').trim() : '';
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
                avgCost:   (col as any).avgCost >= 0 ? parseNum(row[(col as any).avgCost])   : undefined,
                inventoryValue: (col as any).inventoryValue >= 0 ? parseNum(row[(col as any).inventoryValue]) : undefined,
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

        console.log('[SheetsWriter] Loaded', products.length, 'products from API (strictly by ProductId)');
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
                `/values/${SHEET_NAME}!A${rowIndex}:K${rowIndex}?valueInputOption=USER_ENTERED`,
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
            const empty = Array(11).fill('');
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
        const searchVal = String(value).trim().toLowerCase();
        
        for (let i = 0; i < rows.length; i++) {
            const cellVal = String(rows[i][0] || '').trim().toLowerCase();
            if (cellVal === searchVal) return i + 1;
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
    // Guard: only enqueue tab creation ONCE per session per tab name.
    // This prevents the queue deduplication bug where multiple calls to this function
    // with the same path (':batchUpdate' POST) collapse into one, losing the header write.
    if (isTabInitialized(name)) return;
    markTabInitialized(name);

    // Use a unique path suffix per tab name so the queue dedup key is unique
    // (prevents Sales batchUpdate from being deduped against Purchases batchUpdate)
    enqueueOp(
        `:batchUpdate?tab=${encodeURIComponent(name)}`,
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

// ──────────── Stock-only update (by productId/name, no rowIndex needed) ────────────
/**
 * Update only the Stock column (H) for a product, found by productId (col A) or name (col B).
 * Use this as a fallback when rowIndex is 0 / unavailable.
 */
export async function updateProductStockByProductId(
    productId: string,
    productName: string,
    newStock: number
): Promise<boolean> {
    try {
        const cleanId = String(productId).trim();
        const cleanName = String(productName).trim();

        // 1. Search by productId in column A
        let row = await findRowByValue(SHEET_NAME, 0, cleanId);
        
        // 2. Fallback: search by name in column B
        if (row < 0 && cleanName) {
            row = await findRowByValue(SHEET_NAME, 1, cleanName);
        }

        if (row > 0) {
            enqueueOp(
                `/values/${SHEET_NAME}!H${row}?valueInputOption=USER_ENTERED`,
                'PUT',
                { values: [[String(newStock)]] }
            );
            console.log('[SheetsWriter] Dynamic stock update queued for:', cleanId, '/', cleanName, '→ row', row, '=', newStock);
            return true;
        }
        console.warn('[SheetsWriter] Could not find product to update stock. Tried:', cleanId, 'and', cleanName);
        return false;
    } catch (err: any) {
        console.error('[SheetsWriter] updateProductStockByProductId failed:', err.message);
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
