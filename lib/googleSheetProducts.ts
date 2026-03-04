/**
 * Google Sheets Product Service
 * 
 * Fetches product data from a Google Sheet.
 * Supports two formats:
 * 1. Structured: Sheet with headers (Product ID, Category, Product Name, HSN Code, Unit, Cost Price, Selling Price, GST%)
 * 2. Tally Export: Sheet with product names in column A, category headers mixed in (auto-detected)
 */

import { Product } from '@/types';

const PRODUCTS_CACHE_KEY = 'sve_products';
const CACHE_TIMESTAMP_KEY = 'sve_products_cache_ts';
const CACHE_TAB_KEY = 'sve_products_tab';          // tracks which tab the cache came from
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// The active sheet tab name — must match googleSheetWriter.ts SHEET_NAME
const ACTIVE_TAB = 'CurrentProducts';

// If the cache was built from a different tab, wipe it
function clearStaleTabCache(): void {
    if (typeof window === 'undefined') return;
    const cachedTab = localStorage.getItem(CACHE_TAB_KEY);
    if (cachedTab !== ACTIVE_TAB) {
        console.log('[Cache] Tab changed from', cachedTab, '→', ACTIVE_TAB, '— clearing stale product cache');
        localStorage.removeItem(PRODUCTS_CACHE_KEY);
        localStorage.removeItem(CACHE_TIMESTAMP_KEY);
        localStorage.setItem(CACHE_TAB_KEY, ACTIVE_TAB);
    }
}

// Get cached products from localStorage
export const getLocalProducts = (): Product[] => {
    if (typeof window === 'undefined') return [];
    clearStaleTabCache(); // evict if tab changed
    const data = localStorage.getItem(PRODUCTS_CACHE_KEY);
    return data ? JSON.parse(data) : [];
};

// Save products to localStorage cache (tag with current tab name)
export const saveLocalProducts = (products: Product[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    localStorage.setItem(CACHE_TAB_KEY, ACTIVE_TAB);
};

// Check if cache is still fresh
const isCacheFresh = (): boolean => {
    if (typeof window === 'undefined') return false;
    clearStaleTabCache(); // evict if tab changed
    const ts = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!ts) return false;
    return (Date.now() - parseInt(ts)) < CACHE_DURATION_MS;
};

// Known category names from Tally export (these won't be treated as products)
const KNOWN_CATEGORIES = new Set([
    'castirons', 'castiron', 'cookwares', 'fans', 'grinder', 'heater', 'hotbox',
    'maharaja', 'mixie', 'non sticks', 'raja', 'handle', 'raja cookwares',
    'stainless steel', 'table top grinders', 'vaccum flask',
    'sales return', 'scrabs',
]);

// Skip these entries entirely (not products or categories)
const SKIP_ENTRIES = new Set([
    'sri vari enterprises', 't.s.no:609', 'pollachi 642001',
    'list of stock items', '0', 'l', 'not0',
    'cheque return', 'cheque return charge', 'discount',
    'empty box', 'office table', 'old balance',
]);


// Parse CSV text into rows
const parseCSV = (csvText: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++; // skip next quote
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                currentRow.push(currentField.trim());
                if (currentRow.some(f => f.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                if (char === '\r') i++; // skip \n after \r
            } else {
                currentField += char;
            }
        }
    }

    // Last row
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
            rows.push(currentRow);
        }
    }

    return rows;
};

// Check if a row looks like a structured header row
const isStructuredHeader = (row: string[]): boolean => {
    const lower = row.map(c => c.toLowerCase().trim());
    return lower.some(c => c.includes('product id') || c.includes('product name'));
};

// Check if an entry is a category name
const isCategory = (name: string): boolean => {
    const lower = name.toLowerCase().trim();
    return KNOWN_CATEGORIES.has(lower);
};

// Check if an entry should be skipped
const shouldSkip = (name: string): boolean => {
    const lower = name.toLowerCase().trim();
    if (SKIP_ENTRIES.has(lower)) return true;
    // Skip entries that look like addresses, dates, GST numbers, phone numbers, emails
    if (lower.startsWith('block no:')) return true;
    if (lower.startsWith('gst in:')) return true;
    if (lower.startsWith('mob no:')) return true;
    if (lower.startsWith('e-mail')) return true;
    if (lower.match(/^\d+-[a-z]+-\d+ to \d+-[a-z]+-\d+/)) return true; // date ranges
    if (lower.match(/^\d+ stock (group|item)/)) return true; // summary line
    return false;
};

// Detect category from product name (for products that start with a known brand)
const detectCategory = (name: string): string => {
    const upper = name.toUpperCase();
    if (upper.startsWith('MAHARAJA')) return 'Maharaja';
    if (upper.startsWith('MM RAJA') || upper.startsWith('RK280')) return 'Raja';
    if (upper.startsWith('PREETHI')) return 'Mixie';
    if (upper.startsWith('SUMEET')) return 'Mixie';
    if (upper.startsWith('CROMPTON')) return 'Fans';
    if (upper.startsWith('USHA')) return 'Fans';
    if (upper.startsWith('VGUARD') || upper.startsWith('V GUARD')) return 'Fans';
    if (upper.startsWith('BUTTERFLY')) return 'Fans';
    if (upper.startsWith('MILTON')) return 'Vaccum Flask';
    if (upper.startsWith('LAKSHMI')) return 'Grinder';
    if (upper.startsWith('ENSIS')) return 'Stainless Steel';
    if (upper.startsWith('KUMAR')) return 'Maharaja';
    if (upper.includes('CASTIRON') || upper.includes('CAST IRON')) return 'Castirons';
    if (upper.includes('PRESTIGE')) return 'Vaccum Flask';
    if (upper.includes('GASKET') || upper.includes('HANDLE') || upper.includes('COOKER WEIGHT') || upper.includes('SAFTY VALVE') || upper.includes('VENT TUBE')) return 'Raja Cookwares';
    return 'Castiron';
};

// Parse Tally-style sheet (product names in column A, categories mixed in)
const parseTallyFormat = (rows: string[][]): Product[] => {
    const products: Product[] = [];
    let currentCategory = 'Castiron';
    let productIndex = 1;

    for (const row of rows) {
        const name = row[0]?.trim();
        if (!name) continue;

        // Skip header/meta entries
        if (shouldSkip(name)) continue;

        // Check if this is a category header
        if (isCategory(name)) {
            currentCategory = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
            continue;
        }

        // This is a product
        const category = detectCategory(name) !== 'Castiron' ? detectCategory(name) : currentCategory;
        const productId = `P${String(productIndex).padStart(3, '0')}`;

        products.push({
            id: productId,
            productId: productId,
            name: name,
            category: category,
            price: 0,      // To be filled in by user
            costPrice: 0,   // To be filled in by user
            stock: 0,
            gstRate: 0,     // To be filled in by user
            hsnCode: '',    // To be filled in by user
            unit: 'nos',
        });

        productIndex++;
    }

    return products;
};

// Parse structured sheet (with proper column headers)
// Expected column order: A=Product ID, B=Product Name, C=HSN Code, D=Unit,
//                        E=Cost Price, F=Selling Price, G=GST%, H=Stock, I=Category
const parseStructuredFormat = (rows: string[][], headerIndex: number): Product[] => {
    const headers = rows[headerIndex].map(h => h.toLowerCase().trim());
    const colMap = {
        productId: headers.findIndex(h => h.includes('product id')),
        productName: headers.findIndex(h => h.includes('product name') || h === 'name'),
        hsnCode: headers.findIndex(h => h.includes('hsn')),
        unit: headers.findIndex(h => h === 'unit'),
        costPrice: headers.findIndex(h => h.includes('cost')),
        sellingPrice: headers.findIndex(h => h.includes('selling')), // must NOT match 'cost price'
        gstRate: headers.findIndex(h => h.includes('gst')),
        stock: headers.findIndex(h => h === 'stock'),
        category: headers.findIndex(h => h.includes('category')),
    };

    console.log('[GoogleSheet] Column mapping:', colMap);

    const products: Product[] = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        const productName = colMap.productName >= 0 ? row[colMap.productName]?.trim() : '';
        if (!productName) continue;

        const productId = colMap.productId >= 0 ? row[colMap.productId]?.trim() : `P${String(i - headerIndex).padStart(3, '0')}`;
        const fallbackId = `P${String(i - headerIndex).padStart(3, '0')}`;

        products.push({
            id: productId || fallbackId,
            productId: productId || fallbackId,
            name: productName,
            category: colMap.category >= 0 ? row[colMap.category]?.trim() || 'General' : 'General',
            price: colMap.sellingPrice >= 0 ? parseFloat(row[colMap.sellingPrice]) || 0 : 0,
            costPrice: colMap.costPrice >= 0 ? parseFloat(row[colMap.costPrice]) || 0 : 0,
            stock: colMap.stock >= 0 ? parseInt(row[colMap.stock]) || 0 : 0,
            gstRate: (() => {
                const rawGst = colMap.gstRate >= 0 ? parseFloat(row[colMap.gstRate]) || 0 : 0;
                // Normalize: if value > 1 (like 18), it's a percentage; divide by 100
                return rawGst > 1 ? rawGst / 100 : rawGst;
            })(),
            hsnCode: colMap.hsnCode >= 0 ? row[colMap.hsnCode]?.trim() || '' : '',
            unit: colMap.unit >= 0 ? row[colMap.unit]?.trim() || 'nos' : 'nos',
            rowIndex: i + 1, // 1-indexed sheet row — used for accurate updates/deletes
        } as Product & { rowIndex: number });
    }

    return products;
};

// Fetch products from Google Sheet CSV
export const fetchProductsFromSheet = async (csvUrl: string): Promise<Product[]> => {
    // Check cache first
    if (isCacheFresh()) {
        const cached = getLocalProducts();
        if (cached.length > 0) {
            console.log('[GoogleSheet] Using cached products:', cached.length);
            return cached;
        }
    }

    try {
        console.log('[GoogleSheet] Fetching products from:', csvUrl);

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(csvUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn('[GoogleSheet] Sheet not accessible (HTTP', response.status, ')- using cached products.');
            return getLocalProducts();
        }

        const csvText = await response.text();
        const rows = parseCSV(csvText);

        if (rows.length < 2) {
            console.warn('[GoogleSheet] Sheet has no data rows');
            return getLocalProducts();
        }

        // Detect format: structured (with headers) or Tally export
        let products: Product[];
        let headerIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            if (isStructuredHeader(rows[i])) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex >= 0) {
            console.log('[GoogleSheet] Detected structured format with headers at row', headerIndex);
            products = parseStructuredFormat(rows, headerIndex);
        } else {
            console.log('[GoogleSheet] Detected Tally export format, parsing product names');
            products = parseTallyFormat(rows);
        }

        console.log('[GoogleSheet] Loaded', products.length, 'products from sheet');

        // Update cache
        saveLocalProducts(products);

        return products;

    } catch (error: any) {
        if (error?.name === 'AbortError') {
            console.warn('[GoogleSheet] Fetch timed out - using cached products');
        } else {
            console.warn('[GoogleSheet] Could not fetch from Google Sheet. Using cached products.');
        }
        return getLocalProducts();
    }
};
