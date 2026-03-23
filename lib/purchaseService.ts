import {
    SupplierData,
    PurchaseBillData,
    PurchasePaymentData,
    PurchaseAllocationData,
    Product
} from '@/types';

// ============================================
// LocalStorage Configuration & Helpers
// ============================================

const KEYS = {
    SUPPLIERS: 'sve_suppliers',
    BILLS: 'sve_purchase_bills',
    PAYMENTS: 'sve_purchase_payments',
    ALLOCATIONS: 'sve_purchase_allocations',
    PRODUCTS: 'sve_products',
    DELETED_SUPPLIERS: 'sve_deleted_suppliers'
};

/**
 * Normalizes supplier names for robust comparison.
 * Trims, lowercases, and removes common noise (punctuation, "Limited", "Ltd", etc).
 */
export function normalizeSupplierName(name: string): string {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/limited$/g, '')
        .replace(/ltd$/g, '')
        .replace(/pvtltd$/g, '')
        .replace(/pvt$/g, '')
        .trim();
}

function getLocalData<T>(key: string): T[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
}

function saveLocalData<T>(key: string, data: T[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(data));
}

// ============================================
// Supplier Operations
// ============================================

import { fetchRefinedSuppliers, fetchHistoricalVouchers, HistoricalVoucher, SyncData, appendToSupplierSheetTab, SheetRowData, deleteSheetRowByRef } from './googleSheetSuppliers';
import { syncAllStatements, syncLocalToDrive } from './folderSyncService';

export async function forceSyncPurchases(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    console.log('[PurchaseService] Starting unified force sync...');

    try {
        // 1. Sync Refined Suppliers (Meta & Balances)
        const refinedSuppliers = await fetchRefinedSuppliers();
        let currentSuppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);

        if (refinedSuppliers.length > 0) {
            const deletedSupplierNames = getLocalData<string>(KEYS.DELETED_SUPPLIERS);
            const filteredRefined = refinedSuppliers.filter(refined => 
                !deletedSupplierNames.some(name => normalizeSupplierName(name) === normalizeSupplierName(refined.name))
            );

            currentSuppliers = filteredRefined.map(refined => {
                const existing = currentSuppliers.find(s => s.name?.toLowerCase().trim() === refined.name?.toLowerCase().trim());
                if (existing) {
                    return {
                        ...existing,
                        address: refined.address || existing.address,
                        city: refined.city || existing.city,
                        gstNumber: refined.gstNumber || existing.gstNumber,
                        phone: refined.phone || existing.phone,
                        balance: (existing.balance === 0 || existing.balance === undefined) ? refined.balance : existing.balance,
                        updatedAt: new Date()
                    };
                }
                return { ...refined, id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date() };
            });
            saveLocalData(KEYS.SUPPLIERS, currentSuppliers);
        }

        // 2. NEW: Merge Duplicates (by Name or GST)
        await mergeDuplicateSuppliers();

        // 3. Sync with Drive Folder (XLSX Statements)
        await syncAllStatements();

        // 4. Sync Historical Ledger (Individual Sheet Tabs)
        const { vouchers, supplierBalances } = await fetchHistoricalVouchers();
        if (vouchers.length > 0) {
            let latestSuppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
            const enrichedSuppliers = latestSuppliers.map(s => {
                const search = normalizeSupplierName(s.name);
                // Find balance in tab that matches normalized name
                const tabName = Object.keys(supplierBalances).find(k => normalizeSupplierName(k) === search);
                const tabBalance = tabName ? supplierBalances[tabName] : undefined;
                return tabBalance !== undefined ? { ...s, balance: tabBalance } : s;
            });

            await syncHistoricalVouchers(vouchers, enrichedSuppliers);
            saveLocalData(KEYS.SUPPLIERS, enrichedSuppliers);
        }

        // 5. FIX: Repair broken links and populate missing Names
        await repairBrokenLinks();

        console.log('[PurchaseService] Unified force sync completed successfully.');
        return true;
    } catch (err) {
        console.error('[PurchaseService] Unified force sync failed:', err);
        return false;
    }
}

/**
 * Repairs "Unknown" supplier names by re-linking records by name if ID is lost,
 * and populating the supplierName field for manual records.
 */
async function repairBrokenLinks() {
    if (typeof window === 'undefined') return;

    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    if (suppliers.length === 0) return;

    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS);

    let billsModified = false;
    let paymentsModified = false;

    // Helper to find supplier by ID or Name
    const findSupplier = (id?: string, name?: string) => {
        if (id) {
            const s = suppliers.find(s => s.id === id);
            if (s) return s;
        }
        // If name is "Unknown", don't use it for lookup
        if (name && name !== 'Unknown') {
            const search = normalizeSupplierName(name);
            const s = suppliers.find(s => normalizeSupplierName(s.name) === search);
            if (s) return s;
        }
        return null;
    };

    // Helper to recover name from ID or Notes
    const recoverName = (record: any): string | null => {
        // 1. Check ID (HIST-Name-Date-...)
        if (record.id?.startsWith('HIST-')) {
            const parts = record.id.split('-');
            if (parts.length >= 2 && parts[1] !== 'Unknown') {
                const possibleName = parts[1];
                const s = suppliers.find(s => (s.name || '').toLowerCase().trim() === possibleName.toLowerCase().trim());
                if (s) return s.name;
            }
        }
        // 2. Check Notes (Historical: Name - Particulars)
        if (record.notes?.includes('Historical: ')) {
            const noteName = record.notes.split('Historical: ')[1]?.split(' - ')[0];
            if (noteName && noteName !== 'Unknown') {
                const s = suppliers.find(s => (s.name || '').toLowerCase().trim() === noteName.toLowerCase().trim());
                if (s) return s.name;
            }
        }
        return null;
    };

    // 3. New: Match "Unknown" by Date + Amount (Heuristic)
    const findSupplierByHeuristic = (date: Date, amount: number) => {
        const dStr = new Date(date).toISOString().split('T')[0];
        const normalizedAmount = Math.abs(amount);

        // Look for any other bill/payment on the same day with same amount that HAS a name
        // checking both local and sheet sources
        const matchBill = bills.find(b =>
            new Date(b.billDate).toISOString().split('T')[0] === dStr &&
            Math.abs(b.amount - normalizedAmount) < 0.01 &&
            b.supplierName && b.supplierName !== 'Unknown'
        );
        if (matchBill) return suppliers.find(s => s.id === matchBill.supplierId);

        const matchPay = payments.find(p =>
            new Date(p.paymentDate).toISOString().split('T')[0] === dStr &&
            Math.abs(p.amount - normalizedAmount) < 0.01 &&
            p.supplierName && p.supplierName !== 'Unknown'
        );
        if (matchPay) return suppliers.find(s => s.id === matchPay.supplierId);

        return null;
    };

    // 4. Cross-reference: Match Unknown bills/payments using the OTHER type's ref on same/nearby date
    const findSupplierByReference = (date: Date, ref: string) => {
        if (!ref || ref === 'Unknown' || ref.length < 1) return null;

        const dStr = new Date(date).toISOString().split('T')[0];
        // Allow ±1 day matching since payment date may differ from bill date by one day
        const dPrev = new Date(date); dPrev.setDate(dPrev.getDate() - 1);
        const dNext = new Date(date); dNext.setDate(dNext.getDate() + 1);
        const allowedDates = [dPrev.toISOString().split('T')[0], dStr, dNext.toISOString().split('T')[0]];

        // Match bill's ref against payment records with valid name
        const matchPayByRef = payments.find(p =>
            (p.paymentNumber === ref || p.referenceNumber === ref) &&
            allowedDates.includes(new Date(p.paymentDate).toISOString().split('T')[0]) &&
            p.supplierName && p.supplierName !== 'Unknown'
        );
        if (matchPayByRef) return suppliers.find(s => s.id === matchPayByRef.supplierId);

        // Match payment's ref against bill records with valid name
        const matchBillByRef = bills.find(b =>
            b.billNumber === ref &&
            allowedDates.includes(new Date(b.billDate).toISOString().split('T')[0]) &&
            b.supplierName && b.supplierName !== 'Unknown'
        );
        if (matchBillByRef) return suppliers.find(s => s.id === matchBillByRef.supplierId);

        return null;
    };

    bills.forEach(bill => {
        let supplier = findSupplier(bill.supplierId, bill.supplierName);

        if (!supplier || bill.supplierName === 'Unknown') {
            const recoveredName = recoverName(bill);
            if (recoveredName) {
                supplier = findSupplier(undefined, recoveredName);
            }
            // Heuristic match if still Unknown
            if (!supplier && bill.supplierName === 'Unknown') {
                supplier = findSupplierByReference(bill.billDate, bill.billNumber) ||
                    findSupplierByHeuristic(bill.billDate, bill.amount) ||
                    null;
            }
        }

        if (supplier) {
            if (bill.supplierId !== supplier.id) {
                bill.supplierId = supplier.id;
                billsModified = true;
            }
            if (!bill.supplierName || bill.supplierName !== supplier.name) {
                bill.supplierName = supplier.name;
                billsModified = true;
            }
        }
    });

    payments.forEach(payment => {
        let supplier = findSupplier(payment.supplierId, payment.supplierName);

        if (!supplier || payment.supplierName === 'Unknown') {
            const recoveredName = recoverName(payment);
            if (recoveredName) {
                supplier = findSupplier(undefined, recoveredName);
            }
            // Heuristic match if still Unknown
            if (!supplier && payment.supplierName === 'Unknown') {
                supplier = findSupplierByReference(payment.paymentDate, payment.paymentNumber || payment.referenceNumber || '') ||
                    findSupplierByHeuristic(payment.paymentDate, payment.amount) ||
                    null;
            }
        }

        if (supplier) {
            if (payment.supplierId !== supplier.id) {
                payment.supplierId = supplier.id;
                paymentsModified = true;
            }
            if (!payment.supplierName || payment.supplierName !== supplier.name) {
                payment.supplierName = supplier.name;
                paymentsModified = true;
            }
        }
    });

    if (billsModified) saveLocalData(KEYS.BILLS, bills);
    if (paymentsModified) saveLocalData(KEYS.PAYMENTS, payments);

    if (billsModified || paymentsModified) {
        console.log(`[PurchaseService] Data Repair: Healed ${billsModified ? 'bills' : ''} ${paymentsModified ? 'payments' : ''} supplier links.`);
    }
}

/**
 * Merges duplicate suppliers that share the same normalized name or GST number.
 * Consolidates all transactions under a single "master" record.
 */
export async function mergeDuplicateSuppliers() {
    if (typeof window === 'undefined') return;

    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    if (suppliers.length < 2) return;

    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS);
    const allocations = getLocalData<PurchaseAllocationData>(KEYS.ALLOCATIONS);

    const masterMap = new Map<string, SupplierData>(); // Key: Normalized Name or GST -> Master Supplier
    const idRemap = new Map<string, string>(); // Key: Duplicate ID -> Master ID
    const suppliersToRemove = new Set<string>();

    suppliers.forEach(s => {
        const normName = normalizeSupplierName(s.name);
        const gst = s.gstNumber?.trim().toUpperCase();

        let master: SupplierData | undefined;

        // Try to find master by GST first (more accurate)
        if (gst && gst.length > 5) {
            master = masterMap.get(`GST-${gst}`);
        }

        // If not found, try by normalized name
        if (!master) {
            master = masterMap.get(`NAME-${normName}`);
        }

        if (master) {
            // Already have a master for this entity, this is a duplicate.
            idRemap.set(s.id, master.id);
            suppliersToRemove.add(s.id);

            // Merge metadata if master is missing it
            if (!master.gstNumber && s.gstNumber) master.gstNumber = s.gstNumber;
            if (!master.address && s.address) master.address = s.address;
            if (!master.phone && s.phone) master.phone = s.phone;
        } else {
            // New entity, nominate as master
            masterMap.set(`NAME-${normName}`, s);
            if (gst && gst.length > 5) masterMap.set(`GST-${gst}`, s);
        }
    });

    if (suppliersToRemove.size === 0) return;

    console.log(`[PurchaseService] Merging ${suppliersToRemove.size} duplicate suppliers...`);

    // 1. Update all transactions to use Master ID and Master Name
    let txModified = false;

    bills.forEach(b => {
        const masterId = idRemap.get(b.supplierId);
        if (masterId) {
            const master = suppliers.find(s => s.id === masterId);
            if (master) {
                b.supplierId = master.id;
                b.supplierName = master.name;
                txModified = true;
            }
        }
    });

    payments.forEach(p => {
        const masterId = idRemap.get(p.supplierId);
        if (masterId) {
            const master = suppliers.find(s => s.id === masterId);
            if (master) {
                p.supplierId = master.id;
                p.supplierName = master.name;
                txModified = true;
            }
        }
    });

    // 2. Clean up suppliers list
    const finalSuppliers = suppliers.filter(s => !suppliersToRemove.has(s.id));

    // Save changes
    saveLocalData(KEYS.SUPPLIERS, finalSuppliers);
    if (txModified) {
        saveLocalData(KEYS.BILLS, bills);
        saveLocalData(KEYS.PAYMENTS, payments);
    }

    console.log(`[PurchaseService] Merge complete. Removed ${suppliersToRemove.size} duplicates.`);
}

export async function getAllSuppliers(): Promise<SupplierData[]> {
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    return suppliers
        .map(s => ({
            ...s,
            name: s.name || 'Unnamed Supplier',
            balance: s.balance ?? 0
        }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function getSupplier(supplierId: string): Promise<SupplierData | null> {
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    return suppliers.find(s => s.id === supplierId) || null;
}

export async function createSupplier(supplier: Omit<SupplierData, 'id' | 'createdAt' | 'updatedAt' | 'balance' | 'lastTransactionDate'>): Promise<SupplierData | null> {
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);

    // If this supplier was previously deleted, remove them from the deleted list
    const deletedList = getLocalData<string>(KEYS.DELETED_SUPPLIERS);
    const updatedDeletedList = deletedList.filter(name => normalizeSupplierName(name) !== normalizeSupplierName(supplier.name));
    if (updatedDeletedList.length !== deletedList.length) {
        saveLocalData(KEYS.DELETED_SUPPLIERS, updatedDeletedList);
    }

    const newSupplier: SupplierData = {
        id: crypto.randomUUID(),
        ...supplier,
        balance: supplier.openingBalance || 0,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    saveLocalData(KEYS.SUPPLIERS, [newSupplier, ...suppliers]);

    // NEW: Create 'BAL B/F' bill for FIFO allocation
    if (newSupplier.openingBalance && newSupplier.openingBalance > 0) {
        try {
            const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
            const newBill: PurchaseBillData = {
                id: crypto.randomUUID(),
                supplierId: newSupplier.id,
                supplierName: newSupplier.name,
                billNumber: 'BAL B/F',
                billDate: newSupplier.openingBalanceDate ? new Date(newSupplier.openingBalanceDate) : new Date(),
                amount: newSupplier.openingBalance,
                paidAmount: 0,
                balance: newSupplier.openingBalance,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            saveLocalData(KEYS.BILLS, [newBill, ...bills]);
        } catch (e) {
            console.warn('[PurchaseService] Failed to create BAL B/F bill:', e);
        }
    }

    return newSupplier;
}

export async function updateSupplier(supplierId: string, updates: Partial<SupplierData>): Promise<SupplierData | null> {
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const index = suppliers.findIndex(s => s.id === supplierId);

    if (index === -1) return null;

    const updatedSupplier = {
        ...suppliers[index],
        ...updates,
        updatedAt: new Date()
    };

    suppliers[index] = updatedSupplier;
    saveLocalData(KEYS.SUPPLIERS, suppliers);

    // NEW: Update or Create 'BAL B/F' bill for FIFO allocation
    if (updates.openingBalance !== undefined || updates.openingBalanceDate !== undefined) {
        try {
            const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
            const existingOBBill = bills.find(b => b.supplierId === supplierId && b.billNumber === 'BAL B/F');
            
            const hasOB = updatedSupplier.openingBalance && updatedSupplier.openingBalance > 0;
            
            if (hasOB) {
                const obAmount = updatedSupplier.openingBalance || 0;
                if (existingOBBill) {
                    existingOBBill.amount = obAmount;
                    existingOBBill.balance = obAmount - existingOBBill.paidAmount;
                    if (updatedSupplier.openingBalanceDate) {
                        existingOBBill.billDate = new Date(updatedSupplier.openingBalanceDate);
                    }
                    existingOBBill.updatedAt = new Date();
                } else {
                    const newBill: PurchaseBillData = {
                        id: crypto.randomUUID(),
                        supplierId: updatedSupplier.id,
                        supplierName: updatedSupplier.name,
                        billNumber: 'BAL B/F',
                        billDate: updatedSupplier.openingBalanceDate ? new Date(updatedSupplier.openingBalanceDate) : new Date(),
                        amount: obAmount,
                        paidAmount: 0,
                        balance: obAmount,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    bills.push(newBill);
                }
                saveLocalData(KEYS.BILLS, bills);
            } else if (existingOBBill) {
                // Remove if OB is now 0
                const filteredBills = bills.filter(b => b.id !== existingOBBill.id);
                saveLocalData(KEYS.BILLS, filteredBills);
            }
        } catch (e) {
            console.warn('[PurchaseService] Failed to manage BAL B/F bill update:', e);
        }
    }

    // If openingBalance was updated, we need to recalculate balance
    if (updates.openingBalance !== undefined) {
        await recalculateSupplierBalance(supplierId);
    }

    return updatedSupplier;
}

/**
 * Suggests the next payment number based on highest existing number
 */
export async function suggestNextPaymentNumber(): Promise<string> {
    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS);
    const manualPayments = payments
        .filter(p => !p.id.startsWith('HIST-'))
        .map(p => {
            const match = p.paymentNumber?.match(/(\d+)$/);
            return match ? parseInt(match[1]) : 0;
        });

    const highest = manualPayments.length > 0 ? Math.max(...manualPayments) : 0;
    const next = highest + 1;
    return `PAYMENT-${String(next).padStart(3, '0')}`;
}

export async function deleteSupplier(supplierId: string): Promise<boolean> {
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return false;

    // 1. Add to deleted list to prevent re-sync
    const deletedList = getLocalData<string>(KEYS.DELETED_SUPPLIERS);
    if (!deletedList.includes(supplier.name)) {
        deletedList.push(supplier.name);
        saveLocalData(KEYS.DELETED_SUPPLIERS, deletedList);
    }

    // 2. Remove supplier
    const filtered = suppliers.filter(s => s.id !== supplierId);
    saveLocalData(KEYS.SUPPLIERS, filtered);

    // 3. Remove all related data locally
    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS).filter(b => b.supplierId !== supplierId);
    saveLocalData(KEYS.BILLS, bills);

    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS).filter(p => p.supplierId !== supplierId);
    saveLocalData(KEYS.PAYMENTS, payments);

    const allocations = getLocalData<PurchaseAllocationData>(KEYS.ALLOCATIONS).filter(a => {
        const bill = bills.find(b => b.id === a.billId);
        return bill && bill.supplierId !== supplierId;
    });
    saveLocalData(KEYS.ALLOCATIONS, allocations);

    return true;
}

// ============================================
// Purchase Bill Operations
// ============================================

// ============================================
// Helpers
// ============================================

/**
 * Converts Google Sheets serial date (e.g., 46083) or string to JS Date.
 */
function parseSheetDate(dateVal: any): Date {
    if (!dateVal) return new Date();

    // Handle JS Date objects
    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) return dateVal;

    // Handle serial numbers from Google Sheets (e.g., 46083)
    const num = Number(dateVal);
    if (!isNaN(num) && typeof dateVal !== 'boolean' && num > 0) {
        // Offset for Sheets/Excel epoch (1899-12-30) relative to Unix (1970-01-01)
        return new Date((num - 25569) * 86400 * 1000);
    }

    // Handle strings
    const str = String(dateVal).trim();
    if (!str) return new Date();

    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;

    // Fallback: assume Today
    return new Date();
}

/**
 * MM/DD/YYYY format for Sheet/Display consistency
 */
function formatTableDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

export async function rollOverSupplierYear(supplierId: string, closingDateStr: string, openingDateStr: string): Promise<boolean> {
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const supplierIndex = suppliers.findIndex(s => s.id === supplierId);
    if (supplierIndex === -1) return false;
    const supplier = suppliers[supplierIndex];

    const currentBalance = supplier.balance || 0;

    // 1. Delete all local bills, payments, and allocations for this supplier WITHOUT triggering sheet deletes
    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS).filter(b => b.supplierId !== supplierId);
    saveLocalData(KEYS.BILLS, bills);

    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS).filter(p => p.supplierId !== supplierId);
    saveLocalData(KEYS.PAYMENTS, payments);

    const allocations = getLocalData<PurchaseAllocationData>(KEYS.ALLOCATIONS).filter(a => bills.some(b => b.id === a.billId));
    saveLocalData(KEYS.ALLOCATIONS, allocations);

    // 2. Set new Opening Balance and Date
    await updateSupplier(supplierId, {
        openingBalance: currentBalance,
        openingBalanceDate: openingDateStr
    });

    // 3. Append to Google Sheet
    await appendToSupplierSheetTab(supplier.name, {
        date: formatTableDate(new Date(closingDateStr)),
        particulars: '================ FINANCIAL YEAR CLOSED ================',
        vchType: '',
        vchRef: '',
        vchNo: '',
        debit: 0,
        credit: 0,
        balance: Math.abs(currentBalance),
        balanceType: currentBalance >= 0 ? 'Cr' : 'Dr'
    });

    await appendToSupplierSheetTab(supplier.name, {
        date: formatTableDate(new Date(openingDateStr)),
        particulars: `Opening Balance (Forwarded)`,
        vchType: '',
        vchRef: '',
        vchNo: '',
        debit: 0,
        credit: 0,
        balance: Math.abs(currentBalance),
        balanceType: currentBalance >= 0 ? 'Cr' : 'Dr'
    });

    return true;
}

export async function createPurchaseBill(bill: {
    supplierId: string;
    billNumber: string;
    billDate: Date;
    amount: number;
    dueDate?: Date;
    items?: any[];
    notes?: string;
}): Promise<PurchaseBillData | null> {
    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const supplier = suppliers.find(s => s.id === bill.supplierId);

    if (!supplier) {
        console.error('[PurchaseService] Failed to create bill: Supplier not found for ID:', bill.supplierId);
        return null;
    }

    const newBill: PurchaseBillData = {
        id: crypto.randomUUID(),
        supplierId: bill.supplierId,
        supplierName: supplier.name,
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        amount: bill.amount,
        paidAmount: 0,
        balance: bill.amount,
        dueDate: bill.dueDate,
        items: bill.items,
        notes: bill.notes,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    // 1. Save bill
    saveLocalData(KEYS.BILLS, [newBill, ...bills]);

    // 2. Update supplier balance
    const supplierIndex = suppliers.findIndex(s => s.id === bill.supplierId);
    if (supplierIndex !== -1) {
        suppliers[supplierIndex].balance = (suppliers[supplierIndex].balance || 0) + bill.amount;
        suppliers[supplierIndex].lastTransactionDate = new Date();
        suppliers[supplierIndex].updatedAt = new Date();
        saveLocalData(KEYS.SUPPLIERS, suppliers);
    }


    // 3. Update Product Stock
    if (bill.items && Array.isArray(bill.items)) {
        const products = getLocalData<Product>(KEYS.PRODUCTS);
        let productsModified = false;

        for (const item of bill.items) {
            const productId = item.productId || item.product_id;
            if (productId && item.quantity > 0) {
                const productIndex = products.findIndex(p => p.id === productId || p.productId === productId);
                if (productIndex !== -1) {
                    products[productIndex].stock = (products[productIndex].stock || 0) + item.quantity;
                    products[productIndex].costPrice = item.unitPrice || item.unit_price;
                    productsModified = true;
                }
            }
        }

        if (productsModified) {
            saveLocalData(KEYS.PRODUCTS, products);
            // Dispatch custom event to notify DataContext
            window.dispatchEvent(new Event('storage_products_updated'));
        }
    }

    // Track change to Drive
    if (supplier) {
        syncLocalToDrive('PURCHASE', newBill, supplier.name);

        // Fire-and-forget: append to Google Sheet tab for real-time sync
        const newBalance = suppliers[supplierIndex !== -1 ? supplierIndex : 0]?.balance ?? 0;
        const billDate = parseSheetDate(bill.billDate);
        const dateStr = formatTableDate(billDate);

        // Particulars: Match Tally-style "Purchase"
        const parts = ['Purchase'];
        if (bill.notes) parts.push(bill.notes);

        const sheetRow: SheetRowData = {
            date: dateStr,
            particulars: parts.join(' - '),
            vchType: 'Purchase',
            vchRef: 'PURCHASE',
            vchNo: bill.billNumber,
            debit: 0,
            credit: bill.amount,
            balance: newBalance,
            balanceType: newBalance >= 0 ? 'Cr' : 'Dr'
        };
        appendToSupplierSheetTab(supplier.name, sheetRow).catch(err =>
            console.warn('[PurchaseService] Sheet append failed for bill:', err)
        );
    }

    return newBill;
}

export async function getPurchaseBills(supplierId?: string): Promise<PurchaseBillData[]> {
    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
    let filtered = bills.map(b => ({
        ...b,
        billDate: new Date(b.billDate),
        createdAt: new Date(b.createdAt),
        updatedAt: new Date(b.updatedAt),
        dueDate: b.dueDate ? new Date(b.dueDate) : undefined
    }));

    if (supplierId) {
        filtered = filtered.filter(b => b.supplierId === supplierId);
    }

    return filtered.sort((a, b) => b.billDate.getTime() - a.billDate.getTime());
}

export async function deletePurchaseBill(billId: string): Promise<boolean> {
    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
    const billIndex = bills.findIndex(b => b.id === billId);

    if (billIndex === -1) return false;
    const bill = bills[billIndex];

    // 1. Delete bill & allocations first so reallocate knows they are gone
    const filteredBills = bills.filter(b => b.id !== billId);
    saveLocalData(KEYS.BILLS, filteredBills);

    const allocations = getLocalData<PurchaseAllocationData>(KEYS.ALLOCATIONS);
    const filteredAllocations = allocations.filter(a => a.billId !== billId);
    saveLocalData(KEYS.ALLOCATIONS, filteredAllocations);

    // 2. Reallocate & Recalculate Balance (This handles the supplier balance correctly)
    await reallocateAllSupplierPayments(bill.supplierId);

    // 2. Revert Product Stock
    if (bill.items && Array.isArray(bill.items)) {
        const products = getLocalData<Product>(KEYS.PRODUCTS);
        let productsModified = false;

        for (const item of bill.items) {
            const productId = item.productId || item.product_id;
            const quantity = item.quantity || item.qty;
            if (productId && quantity > 0) {
                const productIndex = products.findIndex(p => p.id === productId || p.productId === productId);
                if (productIndex !== -1) {
                    products[productIndex].stock = Math.max(0, (products[productIndex].stock || 0) - quantity);
                    productsModified = true;
                }
            }
        }

        if (productsModified) {
            saveLocalData(KEYS.PRODUCTS, products);
            window.dispatchEvent(new Event('storage_products_updated'));
        }
    }

    // 4. Track change to Drive & Sheet
    const latestSuppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const supplier = latestSuppliers.find(s => s.id === bill.supplierId);
    if (supplier && supplier.name !== 'Unknown') {
        syncLocalToDrive('PURCHASE', { ...bill, deleted: true }, supplier.name);

        // DELETE the matching row(s) from Google Sheet (true deletion, not reversal)
        deleteSheetRowByRef(supplier.name, bill.billNumber).catch(err =>
            console.warn('[PurchaseService] Sheet row deletion failed for bill:', err)
        );
    }

    return true;
}

export async function updatePurchaseBill(
    billId: string,
    updates: {
        billNumber?: string;
        billDate?: Date;
        amount?: number;
        dueDate?: Date;
        items?: any[];
        notes?: string;
    }
): Promise<boolean> {
    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
    const index = bills.findIndex(b => b.id === billId);
    if (index === -1) return false;

    const oldBill = bills[index];
    const oldAmount = oldBill.amount;
    const supplierId = oldBill.supplierId;

    // 1. Update bill fields
    bills[index] = {
        ...oldBill,
        ...updates,
        updatedAt: new Date()
    };

    // Recalculate bill balance if amount changed
    if (updates.amount !== undefined && updates.amount !== oldAmount) {
        const paid = bills[index].paidAmount || 0;
        bills[index].balance = Math.max(0, updates.amount - paid);
    }

    saveLocalData(KEYS.BILLS, bills);

    // 2. Revert product stock if items changed
    if (updates.items && Array.isArray(updates.items)) {
        const products = getLocalData<Product>(KEYS.PRODUCTS);
        let modified = false;

        // Revert old items
        if (oldBill.items && Array.isArray(oldBill.items)) {
            for (const item of oldBill.items) {
                const pid = item.productId || item.product_id;
                if (pid && item.quantity > 0) {
                    const pi = products.findIndex(p => p.id === pid || p.productId === pid);
                    if (pi !== -1) {
                        products[pi].stock = Math.max(0, (products[pi].stock || 0) - item.quantity);
                        modified = true;
                    }
                }
            }
        }
        // Apply new items
        for (const item of updates.items) {
            const pid = item.productId || item.product_id;
            if (pid && item.quantity > 0) {
                const pi = products.findIndex(p => p.id === pid || p.productId === pid);
                if (pi !== -1) {
                    products[pi].stock = (products[pi].stock || 0) + item.quantity;
                    products[pi].costPrice = item.unitPrice || item.unit_price;
                    modified = true;
                }
            }
        }
        if (modified) {
            saveLocalData(KEYS.PRODUCTS, products);
            window.dispatchEvent(new Event('storage_products_updated'));
        }
    }

    // 3. FIFO reallocation to update bill balance and supplier balance
    await reallocateAllSupplierPayments(supplierId);

    // Track change to Drive
    const latestSuppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const supplier = latestSuppliers.find(s => s.id === supplierId);
    if (supplier) {
        syncLocalToDrive('PURCHASE', bills[index], supplier.name);

        // If amount changed, append an adjustment row to Google Sheet
        if (updates.amount !== undefined && Math.abs(updates.amount - oldAmount) > 0.01) {
            const diff = updates.amount - oldAmount;
            const sheetRow: SheetRowData = {
                date: formatTableDate(new Date()),
                particulars: `ADJUSTMENT for Bill #${bills[index].billNumber} (Amount changed from ${oldAmount} to ${updates.amount})`,
                vchType: 'Adjustment',
                vchRef: 'ADJ',
                vchNo: bills[index].billNumber,
                debit: diff < 0 ? Math.abs(diff) : 0, // debit if amount decreased
                credit: diff > 0 ? diff : 0,         // credit if amount increased
                balance: supplier.balance,
                balanceType: supplier.balance >= 0 ? 'Cr' : 'Dr'
            };
            appendToSupplierSheetTab(supplier.name, sheetRow).catch(err =>
                console.warn('[PurchaseService] Sheet adjustment append failed for bill:', err)
            );
        }
    }

    return true;
}

// ============================================
// Purchase Payment Operations with FIFO
// ============================================


export async function createPurchasePayment(payment: {
    supplierId: string;
    paymentNumber: string;
    paymentDate: Date;
    amount: number;
    paymentMode: string;
    referenceNumber?: string;
    notes?: string;
}): Promise<PurchasePaymentData | null> {
    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS);
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);

    const supplier = suppliers.find(s => s.id === payment.supplierId);

    if (!supplier) {
        console.error('[PurchaseService] Failed to create payment: Supplier not found for ID:', payment.supplierId);
        return null;
    }

    const newPayment: PurchasePaymentData = {
        id: crypto.randomUUID(),
        supplierId: payment.supplierId,
        supplierName: supplier.name,
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate,
        amount: payment.amount,
        paymentMode: payment.paymentMode as any,
        referenceNumber: payment.referenceNumber,
        notes: payment.notes,
        createdAt: new Date()
    };

    // 1. Save payment
    saveLocalData(KEYS.PAYMENTS, [newPayment, ...payments]);

    // 2. Apply FIFO allocation
    applyFIFOAllocationLocal(payment.supplierId, newPayment.id, newPayment.paymentNumber, newPayment.amount, newPayment.paymentDate);

    // 3. Update supplier balance
    const supplierIndex = suppliers.findIndex(s => s.id === payment.supplierId);
    if (supplierIndex !== -1) {
        suppliers[supplierIndex].balance = Math.max(0, suppliers[supplierIndex].balance - payment.amount);
        suppliers[supplierIndex].lastTransactionDate = new Date();
        suppliers[supplierIndex].updatedAt = new Date();
        saveLocalData(KEYS.SUPPLIERS, suppliers);
    }

    // Track change to Drive
    if (supplier) {
        syncLocalToDrive('PAYMENT', newPayment, supplier.name);

        // Fire-and-forget: append to Google Sheet tab for real-time sync
        const newBalance = suppliers[supplierIndex !== -1 ? supplierIndex : 0]?.balance ?? 0;
        const payDate = parseSheetDate(payment.paymentDate);
        const dateStr = formatTableDate(payDate);
        const modeLabel = payment.paymentMode === 'BANK_TRANSFER' ? 'Bank Transfer'
            : payment.paymentMode === 'CASH' ? 'Cash'
                : payment.paymentMode === 'CHEQUE' ? 'Cheque'
                    : payment.paymentMode === 'UPI' ? 'UPI'
                        : (payment.paymentMode || 'Payment');

        const parts = [modeLabel];
        if (payment.referenceNumber) parts.push(`Ref: ${payment.referenceNumber}`);
        if (payment.notes) parts.push(payment.notes);

        const sheetRow: SheetRowData = {
            date: dateStr,
            particulars: parts.join(' - '),
            vchType: 'Payment',
            vchRef: 'Payment',
            vchNo: payment.paymentNumber,
            debit: payment.amount,
            credit: 0,
            balance: newBalance,
            balanceType: newBalance >= 0 ? 'Cr' : 'Dr'
        };
        appendToSupplierSheetTab(supplier.name, sheetRow).catch(err =>
            console.warn('[PurchaseService] Sheet append failed for payment:', err)
        );
    }

    return newPayment;
}

function applyFIFOAllocationLocal(
    supplierId: string,
    paymentId: string,
    paymentNumber: string,
    paymentAmount: number,
    paymentDate: Date
) {
    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
    const supplierBills = bills
        .filter(b => b.supplierId === supplierId && b.balance > 0)
        .sort((a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime());

    let remainingAmount = paymentAmount;
    const allocations = getLocalData<PurchaseAllocationData>(KEYS.ALLOCATIONS);

    for (const bill of supplierBills) {
        if (remainingAmount <= 0) break;

        const allocationAmount = Math.min(remainingAmount, bill.balance);

        // Create allocation
        const newAllocation: PurchaseAllocationData = {
            id: crypto.randomUUID(),
            billId: bill.id,
            billNumber: bill.billNumber,
            paymentId: paymentId,
            paymentNumber: paymentNumber,
            amount: allocationAmount,
            allocationDate: paymentDate,
            createdAt: new Date()
        };
        allocations.push(newAllocation);

        // Update bill in main bills array
        const billIdx = bills.findIndex(b => b.id === bill.id);
        if (billIdx !== -1) {
            bills[billIdx].paidAmount = (bills[billIdx].paidAmount || 0) + allocationAmount;
            bills[billIdx].balance = bills[billIdx].amount - bills[billIdx].paidAmount;
            bills[billIdx].updatedAt = new Date();
        }

        remainingAmount -= allocationAmount;
    }

    saveLocalData(KEYS.BILLS, bills);
    saveLocalData(KEYS.ALLOCATIONS, allocations);
}

export async function getPurchasePayments(supplierId?: string): Promise<PurchasePaymentData[]> {
    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS);
    let filtered = payments.map(p => ({
        ...p,
        paymentDate: new Date(p.paymentDate),
        createdAt: new Date(p.createdAt)
    }));

    if (supplierId) {
        filtered = filtered.filter(p => p.supplierId === supplierId);
    }

    return filtered.sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
}

export async function updatePurchasePayment(paymentId: string, updates: Partial<PurchasePaymentData>): Promise<boolean> {
    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS);
    const index = payments.findIndex(p => p.id === paymentId);
    if (index === -1) return false;

    const payment = payments[index];
    const supplierId = payment.supplierId;
    const oldAmount = payment.amount;

    payments[index] = {
        ...payment,
        ...updates,
        id: payment.id,
        supplierId: payment.supplierId
    };

    saveLocalData(KEYS.PAYMENTS, payments);

    // After updating payment, we MUST reallocate everything for this supplier to ensure FIFO correctness
    await reallocateAllSupplierPayments(supplierId);

    // Track change to Drive & Sheet
    const latestSuppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const supplier = latestSuppliers.find(s => s.id === supplierId);
    if (supplier) {
        syncLocalToDrive('PAYMENT', payments[index], supplier.name);

        // If amount changed, append adjustment row
        if (updates.amount !== undefined && Math.abs(updates.amount - oldAmount) > 0.01) {
            const diff = updates.amount - oldAmount;
            const sheetRow: SheetRowData = {
                date: formatTableDate(new Date()),
                particulars: `ADJUSTMENT for Payment #${payment.paymentNumber} (Amount changed from ${oldAmount} to ${updates.amount})`,
                vchType: 'Adjustment',
                vchRef: 'ADJ',
                vchNo: payment.paymentNumber,
                debit: diff > 0 ? diff : 0,         // debit if payment increased
                credit: diff < 0 ? Math.abs(diff) : 0, // credit if payment decreased
                balance: supplier.balance,
                balanceType: supplier.balance >= 0 ? 'Cr' : 'Dr'
            };
            appendToSupplierSheetTab(supplier.name, sheetRow).catch(err =>
                console.warn('[PurchaseService] Sheet adjustment append failed for payment:', err)
            );
        }
    }

    return true;
}

export async function deletePurchasePayment(paymentId: string): Promise<boolean> {
    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS);
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return false;

    const supplierId = payment.supplierId;
    const filteredPayments = payments.filter(p => p.id !== paymentId);
    saveLocalData(KEYS.PAYMENTS, filteredPayments);

    // After deleting payment, we MUST reallocate everything for this supplier
    await reallocateAllSupplierPayments(supplierId);

    // Track change to Drive & Sheet
    const latestSuppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const sObj = latestSuppliers.find(s => s.id === supplierId);
    if (sObj && sObj.name !== 'Unknown') {
        syncLocalToDrive('PAYMENT', { ...payment, deleted: true }, sObj.name);

        // DELETE the matching row(s) from Google Sheet (true deletion, not reversal)
        deleteSheetRowByRef(sObj.name, payment.paymentNumber).catch(err =>
            console.warn('[PurchaseService] Sheet row deletion failed for payment:', err)
        );
    }

    return true;
}

// ============================================
// Supplier Statement
// ============================================

export interface SupplierStatementEntry {
    date: Date;
    type: 'BILL' | 'PAYMENT';
    reference: string;
    debit: number;
    credit: number;
    balance: number;
    notes?: string;
}

export async function getSupplierStatement(
    supplierId: string,
    startDate?: Date,
    endDate?: Date
): Promise<SupplierStatementEntry[]> {
    const supplier = getLocalData<SupplierData>(KEYS.SUPPLIERS).find(s => s.id === supplierId);
    const openingBalanceRow: SupplierStatementEntry[] = (supplier?.openingBalance && supplier.openingBalance !== 0) ? [{
        date: supplier.openingBalanceDate ? new Date(supplier.openingBalanceDate) : new Date('2000-01-01'),
        type: 'BILL' as any,
        reference: 'Bal B/F',
        debit: 0,
        credit: 0,
        balance: supplier.openingBalance,
        notes: 'Opening Balance'
    }] : [];

    // Map Bills (Purchases) as CREDIT (Increase amount we owe)
    // Map Payments as DEBIT (Decrease amount we owe)
    const bills = (await getPurchaseBills(supplierId)).map(b => ({
        date: new Date(b.billDate),
        type: 'BILL' as const,
        reference: b.billNumber,
        debit: 0,
        credit: b.amount,
        balance: 0,
        notes: b.notes
    }));

    const payments = (await getPurchasePayments(supplierId)).map(p => ({
        date: new Date(p.paymentDate),
        type: 'PAYMENT' as const,
        reference: p.paymentNumber,
        debit: p.amount,
        credit: 0,
        balance: 0,
        notes: p.notes
    }));

    // If we have a 'BAL B/F' bill, we don't need the manual openingBalanceRow
    const obBill = bills.find(b => b.reference === 'BAL B/F');
    const hasBALBF = !!obBill;

    // Create a specialized opening row from the bill if it exists, or from supplier data
    let finalOpeningRow: SupplierStatementEntry[] = [];
    if (hasBALBF) {
        finalOpeningRow = [{
            date: obBill.date,
            type: 'BILL' as any,
            reference: 'BAL B/F',
            debit: 0,
            credit: 0, // Hide from columns as requested
            balance: obBill.credit, // This will be the starting point
            notes: 'Opening Balance'
        }];
    } else if (openingBalanceRow.length > 0) {
        finalOpeningRow = [{
            ...openingBalanceRow[0],
            debit: 0,
            credit: 0
        }];
    }

    // Filter out the 'BAL B/F' from the main bills list to avoid double counting and handle it separately
    const otherBills = bills.filter(b => b.reference !== 'BAL B/F');

    let entries = [...finalOpeningRow, ...otherBills, ...payments];

    if (startDate) {
        entries = entries.filter(e => e.date >= startDate);
    }
    if (endDate) {
        entries = entries.filter(e => e.date <= endDate);
    }

    // Sort by date then type (BILL before PAYMENT on same date)
    entries.sort((a, b) => {
        if (a.date.getTime() !== b.date.getTime()) {
            return a.date.getTime() - b.date.getTime();
        }
        // If same date, Opening Balance (BAL B/F) first
        if (a.reference === 'BAL B/F') return -1;
        if (b.reference === 'BAL B/F') return 1;
        return a.type === 'BILL' ? -1 : 1;
    });

    // Calculate running balance starting from the Opening Balance
    let currentBalance = 0;
    const result = entries.map(e => {
        if (e.reference === 'BAL B/F') {
            currentBalance = e.balance;
            return { ...e };
        }
        currentBalance += (e.credit - e.debit);
        return { ...e, balance: currentBalance };
    });

    return result;
}

// ============================================
// Dashboard Metrics
// ============================================

export async function getTotalPayables(): Promise<number> {
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    return suppliers.reduce((sum, s) => sum + (s.balance || 0), 0);
}

// ============================================
// Maintenance & Helpers
// ============================================

export async function recalculateSupplierBalance(supplierId: string): Promise<number> {
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return 0;

    const bills = await getPurchaseBills(supplierId);
    const payments = await getPurchasePayments(supplierId);

    const totalBills = bills.reduce((sum, b) => sum + b.amount, 0);
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
    
    // Debit (+) increases balance (what we owe), Credit (-) decreases it (payments)
    // If a 'BAL B/F' bill exists, it's already in totalBills, so we use 0 for the initial term
    const hasBALBF = bills.some(b => b.billNumber === 'BAL B/F');
    const baseBalance = hasBALBF ? 0 : (supplier.openingBalance || 0);
    const newBalance = baseBalance + totalBills - totalPayments;

    const index = suppliers.findIndex(s => s.id === supplierId);
    if (index !== -1) {
        suppliers[index].balance = newBalance;
        suppliers[index].lastTransactionDate = new Date();
        suppliers[index].updatedAt = new Date();
        saveLocalData(KEYS.SUPPLIERS, suppliers);
    }

    return newBalance;
}

export async function getBillAllocations(billId: string): Promise<PurchaseAllocationData[]> {
    const allocations = getLocalData<PurchaseAllocationData>(KEYS.ALLOCATIONS);
    return allocations
        .filter(a => a.billId === billId)
        .map(a => ({
            ...a,
            allocationDate: new Date(a.allocationDate),
            createdAt: new Date(a.createdAt)
        }))
        .sort((a, b) => b.allocationDate.getTime() - a.allocationDate.getTime());
}
export async function syncHistoricalVouchers(vouchers: HistoricalVoucher[], suppliers: SupplierData[]): Promise<void> {
    try {
        if (vouchers.length === 0) return;

        const currentBills = getLocalData<PurchaseBillData>(KEYS.BILLS);
        const currentPayments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS);

        let billsModified = false;
        let paymentsModified = false;

        // Track suppliers that need reallocation
        const suppliersToReallocate = new Set<string>();

        // To ensure fresh data (and fix bad dates from previous imports), 
        // we clear all existing HIST- records and re-import them from the sheet.
        // We preserve manual records (UUID-based).
        const manualBills = currentBills.filter(b => !b.id.startsWith('HIST-'));
        currentBills.length = 0;
        currentBills.push(...manualBills);

        const manualPayments = currentPayments.filter(p => !p.id.startsWith('HIST-'));
        currentPayments.length = 0;
        currentPayments.push(...manualPayments);

        console.log(`[PurchaseService] Sync: Cleared stale historical records. Processing ${vouchers.length} new vouchers...`);

        console.log(`[PurchaseService] Processing ${vouchers.length} vouchers from Google Sheet tabs...`);

        vouchers.forEach((vch) => {
            const vchNormalized = normalizeSupplierName(vch.supplierName);
            const supplier = suppliers.find(s =>
                normalizeSupplierName(s.name) === vchNormalized
            );
            if (!supplier) return;

            const particulars = (vch.particulars || '').toLowerCase();
            const vchTypeLower = (vch.vchType || '').toLowerCase();

            // Format date for deterministic ID (e.g., 03/05/2026 -> 20260305)
            // Use String(vch.date) to handle numbers or strings safely
            const vchDate = parseSheetDate(vch.date);
            const dateStr = formatTableDate(vchDate).replace(/[^0-9]/g, '');
            const deterministicId = `HIST-${vch.supplierName}-${dateStr}-${vch.vchType}-${vch.vchNo}`;

            // 1. Detection: Purchase vs Payment vs Opening
            const isPurchase = vchTypeLower.includes('pur') || vchTypeLower.includes('pru');
            const isPayment = vchTypeLower.includes('pay') || vchTypeLower.includes('rec') ||
                vchTypeLower.includes('jou') || (vch.debit > 0 && vch.credit === 0);
            const isOpening = particulars.includes('opening balance');
            if (isPurchase || (isOpening && vch.credit > 0)) {
                const amount = vch.credit || vch.debit || 0;
                const billDate = isOpening ? new Date('2019-04-01') : vchDate;

                // Deduplication: Check if a manual bill with same ref, amount and date exists
                const manualMatch = manualBills.find(b =>
                    b.supplierId === supplier.id &&
                    b.billNumber === vch.vchNo &&
                    Math.abs(b.amount - amount) < 0.01 &&
                    new Date(b.billDate).toDateString() === billDate.toDateString()
                );

                if (!manualMatch) {
                    const existing = currentBills.find(b => b.id === deterministicId);
                    if (!existing) {
                        currentBills.push({
                            id: deterministicId,
                            supplierId: supplier.id,
                            supplierName: supplier.name,
                            billNumber: vch.vchNo || (isOpening ? 'OPENING' : `P-${dateStr}`),
                            billDate: billDate,
                            amount: amount,
                            paidAmount: 0,
                            balance: amount,
                            notes: `Historical: ${vch.particulars}`,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                        billsModified = true;
                        suppliersToReallocate.add(supplier.id);
                    }
                }
            } else if (isPayment || (isOpening && vch.debit > 0)) {
                const amount = vch.debit || vch.credit || 0;
                const payDate = isOpening ? new Date('2019-04-01') : vchDate;

                // Deduplication: Check if a manual payment with same ref, amount and date exists
                const manualMatch = manualPayments.find(p =>
                    p.supplierId === supplier.id &&
                    (p.paymentNumber === vch.vchNo || p.referenceNumber === vch.vchNo) &&
                    Math.abs(p.amount - amount) < 0.01 &&
                    new Date(p.paymentDate).toDateString() === payDate.toDateString()
                );

                if (!manualMatch) {
                    const existing = currentPayments.find(p => p.id === deterministicId);
                    if (!existing) {
                        // Detect Payment Mode from Particulars
                        let paymentMode: any = 'OTHER';
                        if (particulars.includes('cash')) paymentMode = 'CASH';
                        if (particulars.includes('cheque')) paymentMode = 'CHEQUE';
                        if (particulars.includes('bank') || particulars.includes('neft') || particulars.includes('transfer')) paymentMode = 'BANK_TRANSFER';
                        if (particulars.includes('upi') || particulars.includes('gpay')) paymentMode = 'UPI';

                        currentPayments.push({
                            id: deterministicId,
                            supplierId: supplier.id,
                            supplierName: supplier.name,
                            paymentNumber: vch.vchNo || (isOpening ? 'OPENING-PMT' : `PMT-${dateStr}`),
                            paymentDate: payDate,
                            amount: amount,
                            paymentMode: paymentMode,
                            referenceNumber: vch.vchNo,
                            notes: `Historical: ${vch.particulars}`,
                            createdAt: new Date()
                        });
                        paymentsModified = true;
                        suppliersToReallocate.add(supplier.id);
                    }
                }
            }
        });

        if (billsModified) saveLocalData(KEYS.BILLS, currentBills);
        if (paymentsModified) saveLocalData(KEYS.PAYMENTS, currentPayments);

        if (suppliersToReallocate.size > 0) {
            console.log(`[PurchaseService] Historical sync: Reallocating for ${suppliersToReallocate.size} suppliers.`);
            for (const supplierId of suppliersToReallocate) {
                await reallocateAllSupplierPayments(supplierId);
            }
        }
    } catch (error) {
        console.error('[PurchaseService] Failed to sync historical vouchers:', error);
    }
}

export async function reallocateAllSupplierPayments(supplierId: string): Promise<void> {
    const bills = getLocalData<PurchaseBillData>(KEYS.BILLS);
    const payments = getLocalData<PurchasePaymentData>(KEYS.PAYMENTS);
    const allocations = getLocalData<PurchaseAllocationData>(KEYS.ALLOCATIONS);

    // 1. Reset all bills for this supplier
    bills.forEach(b => {
        if (b.supplierId === supplierId) {
            b.paidAmount = 0;
            b.balance = b.amount;
        }
    });

    // 2. Clear existing allocations for this supplier
    const filteredAllocations = allocations.filter(a => {
        const bill = bills.find(b => b.id === a.billId);
        return bill?.supplierId !== supplierId;
    });

    // 3. Get all payments for this supplier sorted by date
    const supplierPayments = payments
        .filter(p => p.supplierId === supplierId)
        .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());

    // 4. Apply each payment using FIFO
    const newAllocations = [...filteredAllocations];

    for (const payment of supplierPayments) {
        const unpaidBills = bills
            .filter(b => b.supplierId === supplierId && b.balance > 0)
            .sort((a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime());

        let remainingAmount = payment.amount;

        for (const bill of unpaidBills) {
            if (remainingAmount <= 0) break;

            const allocationAmount = Math.min(remainingAmount, bill.balance);

            newAllocations.push({
                id: crypto.randomUUID(),
                billId: bill.id,
                billNumber: bill.billNumber,
                paymentId: payment.id,
                paymentNumber: payment.paymentNumber,
                amount: allocationAmount,
                allocationDate: payment.paymentDate,
                createdAt: new Date()
            });

            bill.paidAmount = (bill.paidAmount || 0) + allocationAmount;
            bill.balance = bill.amount - bill.paidAmount;
            remainingAmount -= allocationAmount;
        }
    }

    saveLocalData(KEYS.BILLS, bills);
    saveLocalData(KEYS.ALLOCATIONS, newAllocations);

    // 5. Update supplier balance
    await recalculateSupplierBalance(supplierId);
}
