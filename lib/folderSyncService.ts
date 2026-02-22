import * as XLSX from 'xlsx';
import { listFiles, downloadFile, exportFile, getSyncFolderId, uploadInvoicePDF, uploadTextFile, findFilesByName } from './googleDriveService';
import {
    SupplierData,
    PurchaseBillData,
    PurchasePaymentData,
    PurchaseAllocationData
} from '@/types';

// Standardize dates from Tally formats
function parseTallyDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    // Handle DD-MMM-YY or DD-MMM-YYYY
    const clean = dateStr.trim();
    const d = new Date(clean);
    return isNaN(d.getTime()) ? new Date() : d;
}

const KEYS = {
    SUPPLIERS: 'sve_suppliers',
    BILLS: 'sve_purchase_bills',
    PAYMENTS: 'sve_purchase_payments',
    ALLOCATIONS: 'sve_purchase_allocations'
};

const SUPPLIER_FOLDER = 'Supplier Statements';
const DEALER_FOLDER = 'Dealer Statements';

/** Standardize currency strings to numbers */
function parseCurrency(val: any): number {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    const str = String(val).replace(/,/g, '').replace(/[^\d.-]/g, '');
    return parseFloat(str) || 0;
}

/**
 * Parses a Tally-style or generic statement from an Excel/Sheet buffer
 */
function parseStatementRows(rows: any[][], fileName: string, sheetName?: string) {
    const bills: Partial<PurchaseBillData>[] = [];
    const payments: Partial<PurchasePaymentData>[] = [];

    // Fallback order: Header "Ledger:" > "Name - Ledger Account" > Tab Name > File Name
    let currentEntityName = (sheetName || fileName.replace(/\.[^/.]+$/, "")).trim();
    let supplierAddress = '';
    let supplierGst = '';

    // Column indices (dynamic detection)
    let colIndices = {
        date: -1,
        particulars: -1,
        vchType: -1,
        vchNo: -1,
        debit: -1,
        credit: -1
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const colA = String(row[0] || '').trim();
        const colB = String(row[1] || '').trim();

        // 1. Detect Ledger Name & Metadata
        if (colA.toLowerCase().startsWith('ledger:')) {
            const headerName = colB || colA.replace(/Ledger:?/i, '').trim();
            if (headerName) currentEntityName = headerName;
            continue;
        }

        // Support "[Name] - Ledger Account" pattern
        const ledgerMatch = colA.match(/(.+) - Ledger Account/i);
        if (ledgerMatch) {
            currentEntityName = ledgerMatch[1].trim();

            // Look ahead for Address and GST (usually in next few rows)
            const nextRow = rows[i + 1];
            const nextRow2 = rows[i + 2];
            if (nextRow && nextRow[0] && String(nextRow[0]).trim().length > 5) {
                supplierAddress = String(nextRow[0]).trim();
            }
            if (nextRow2 && String(nextRow2[0]).toLowerCase().includes('gst:')) {
                const gstMatch = String(nextRow2[0]).match(/GST:\s*([A-Z0-9]+)/i);
                if (gstMatch) supplierGst = gstMatch[1].trim();
            }
            continue;
        }

        // 2. Detect Column Headers
        if (colIndices.date === -1) {
            const rowStr = row.map(c => String(c || '').toLowerCase()).join('|');
            if (rowStr.includes('date') && (rowStr.includes('debit') || rowStr.includes('credit'))) {
                row.forEach((cell, idx) => {
                    const c = String(cell || '').toLowerCase();
                    if (c.includes('date')) colIndices.date = idx;
                    if (c.includes('particular')) colIndices.particulars = idx;
                    if (c.includes('vch type') || (c === 'type' && !rowStr.includes('vch type'))) colIndices.vchType = idx;
                    if (c.includes('vch no') || c.includes('vch ref')) colIndices.vchNo = idx;
                    if (c.includes('debit')) colIndices.debit = idx;
                    if (c.includes('credit')) colIndices.credit = idx;
                });
                continue;
            }
            continue; // Keep looking for headers
        }

        // 3. Parse Data Rows
        const dateRaw = row[colIndices.date];
        if (!dateRaw) continue;

        const dateStr = String(dateRaw).trim();
        // Skip total/header noise
        if (!dateStr || dateStr.toLowerCase().includes('total') || dateStr.toLowerCase().includes('period') || dateStr.toLowerCase().includes('date')) continue;

        const particulars = colIndices.particulars !== -1 ? String(row[colIndices.particulars] || '').trim() : '';
        const vchType = colIndices.vchType !== -1 ? String(row[colIndices.vchType] || '').trim() : '';
        const vchNo = colIndices.vchNo !== -1 ? String(row[colIndices.vchNo] || '').trim() : '';
        const debit = colIndices.debit !== -1 ? parseCurrency(row[colIndices.debit]) : 0;
        const credit = colIndices.credit !== -1 ? parseCurrency(row[colIndices.credit]) : 0;

        // Skip non-transactional rows
        if (particulars.toLowerCase().includes('opening balance') || particulars.toLowerCase().includes('closing balance')) continue;
        if (debit === 0 && credit === 0) continue;

        const isPayment = vchType.toLowerCase().includes('pay') ||
            vchType.toLowerCase().includes('rcpt') ||
            (credit > 0 && debit === 0); // In this sheet, Credit = Payment

        if (isPayment) {
            payments.push({
                amount: credit || debit,
                paymentDate: parseTallyDate(dateStr),
                paymentNumber: vchNo || `P-${Date.now()}-${i}`,
                referenceNumber: vchNo || particulars,
                notes: `Auto-synced from Drive: ${fileName}`
            });
        } else {
            // Assume it's a Bill (Purchase etc)
            bills.push({
                billNumber: vchNo || particulars,
                billDate: parseTallyDate(dateStr),
                amount: debit || credit, // In this sheet, Debit = Bill
                notes: `Auto-synced from Drive: ${fileName}`
            });
        }
    }

    return { name: currentEntityName, address: supplierAddress, gst: supplierGst, bills, payments };
}

/**
 * Syncs all statements from Drive to LocalStorage
 */
export async function syncAllStatements() {
    console.log('[FolderSync] Starting full sync (with state reset)...');

    try {
        const supplierFolderId = await getSyncFolderId(SUPPLIER_FOLDER);

        // 1. Discovery: Check the folder + Search by name
        const folderFiles = await listFiles(supplierFolderId);
        const searchedFiles = await findFilesByName('Supplier_Group3_Ledger');

        // Merge and deduplicate by ID
        const fileMap = new Map();
        [...folderFiles, ...searchedFiles].forEach(f => fileMap.set(f.id, f));
        const supplierFiles = Array.from(fileMap.values());

        const allNewBills: PurchaseBillData[] = [];
        const allNewPayments: PurchasePaymentData[] = [];

        // 2. State Reset: Clear existing entities to "remove old sheet" data
        const allSuppliers: SupplierData[] = [];

        for (const file of supplierFiles) {
            console.log(`[FolderSync] Processing file: ${file.name}`);
            let buffer: ArrayBuffer;

            if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
                buffer = await exportFile(file.id);
            } else if (file.mimeType.includes('spreadsheet') || file.name.endsWith('.xlsx')) {
                buffer = await downloadFile(file.id);
            } else {
                continue; // Skip PDFs etc for now
            }

            const workbook = XLSX.read(buffer, { type: 'array' });

            // Iterate through ALL sheets in the workbook
            for (const sheetName of workbook.SheetNames) {
                // Skip common non-data tabs
                if (sheetName.toLowerCase().match(/list|index|summary|sheet\d+/)) continue;

                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

                if (rows.length < 2) continue; // Skip empty sheets

                const { name, address, gst, bills, payments } = parseStatementRows(rows, file.name, sheetName);
                console.log(`[FolderSync]   -> Parsed tab "${sheetName}" as entity "${name}"`);

                // Find or Create Supplier in the NEW list
                let supplier = allSuppliers.find(s => s.name.toLowerCase() === name.toLowerCase());
                if (!supplier) {
                    supplier = {
                        id: crypto.randomUUID(),
                        name: name,
                        address: address,
                        gstNumber: gst,
                        balance: 0,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    allSuppliers.push(supplier);
                } else if (address || gst) {
                    // Update metadata if found in sheet
                    if (address) supplier.address = address;
                    if (gst) supplier.gstNumber = gst;
                }

                // Map Bills
                bills.forEach(b => {
                    const amount = b.amount || 0;
                    allNewBills.push({
                        ...b,
                        id: crypto.randomUUID(),
                        supplierId: supplier!.id,
                        amount: amount,
                        paidAmount: 0,
                        balance: amount,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    } as PurchaseBillData);
                });

                // Map Payments
                payments.forEach(p => {
                    allNewPayments.push({
                        ...p,
                        id: crypto.randomUUID(),
                        supplierId: supplier!.id,
                        paymentMode: 'OTHER',
                        createdAt: new Date()
                    } as PurchasePaymentData);
                });
            }
        }

        // 3. Persistent Save (Full Overwrite)
        localStorage.setItem(KEYS.SUPPLIERS, JSON.stringify(allSuppliers));
        localStorage.setItem(KEYS.BILLS, JSON.stringify(allNewBills));
        localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(allNewPayments));

        console.log(`[FolderSync] Sync complete. ${allSuppliers.length} suppliers, ${allNewBills.length} bills, ${allNewPayments.length} payments.`);
        return true;
    } catch (error) {
        console.error('[FolderSync] Sync failed:', error);
        return false;
    }
}

/**
 * Updates the corresponding Drive folder when a CRUD operation occurs
 */
export async function syncLocalToDrive(type: 'PURCHASE' | 'PAYMENT', data: any, entityName: string) {
    if (typeof window === 'undefined') return;

    console.log(`[FolderSync] Writing local change to Drive for ${entityName}...`);
    try {
        const isSupplier = type.startsWith('PURCHASE') || type.includes('SUPPLIER');
        const folderId = await getSyncFolderId(isSupplier ? SUPPLIER_FOLDER : DEALER_FOLDER);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `Update_${entityName}_${timestamp}.json`;
        const content = JSON.stringify({ type, data, timestamp }, null, 2);

        await uploadTextFile(content, fileName, folderId, 'application/json');
        console.log(`[FolderSync] Local CRUD uploaded to Drive as ${fileName}`);
    } catch (e) {
        console.error(`[FolderSync] Local to Drive sync failed:`, e);
    }
}
