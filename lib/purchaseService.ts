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
    PRODUCTS: 'sve_products'
};

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

    const newSupplier: SupplierData = {
        id: crypto.randomUUID(),
        ...supplier,
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    saveLocalData(KEYS.SUPPLIERS, [newSupplier, ...suppliers]);
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
    return updatedSupplier;
}

export async function deleteSupplier(supplierId: string): Promise<boolean> {
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const filtered = suppliers.filter(s => s.id !== supplierId);

    if (filtered.length === suppliers.length) return false;

    saveLocalData(KEYS.SUPPLIERS, filtered);
    return true;
}

// ============================================
// Purchase Bill Operations
// ============================================

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

    const newBill: PurchaseBillData = {
        id: crypto.randomUUID(),
        supplierId: bill.supplierId,
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
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
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

    // 1. Revert Supplier Balance
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const supplierIndex = suppliers.findIndex(s => s.id === bill.supplierId);
    if (supplierIndex !== -1) {
        suppliers[supplierIndex].balance = Math.max(0, suppliers[supplierIndex].balance - bill.amount);
        suppliers[supplierIndex].updatedAt = new Date();
        saveLocalData(KEYS.SUPPLIERS, suppliers);
    }

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

    // 3. Delete the bill
    const filteredBills = bills.filter(b => b.id !== billId);
    saveLocalData(KEYS.BILLS, filteredBills);

    // 4. Also delete related allocations
    const allocations = getLocalData<PurchaseAllocationData>(KEYS.ALLOCATIONS);
    const filteredAllocations = allocations.filter(a => a.billId !== billId);
    saveLocalData(KEYS.ALLOCATIONS, filteredAllocations);

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

    const newPayment: PurchasePaymentData = {
        id: crypto.randomUUID(),
        supplierId: payment.supplierId,
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
    applyFIFOAllocationLocal(payment.supplierId, newPayment.id, payment.paymentNumber, payment.amount, payment.paymentDate);

    // 3. Update supplier balance
    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
    const supplierIndex = suppliers.findIndex(s => s.id === payment.supplierId);
    if (supplierIndex !== -1) {
        suppliers[supplierIndex].balance = Math.max(0, suppliers[supplierIndex].balance - payment.amount);
        suppliers[supplierIndex].lastTransactionDate = new Date();
        suppliers[supplierIndex].updatedAt = new Date();
        saveLocalData(KEYS.SUPPLIERS, suppliers);
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
    const bills = (await getPurchaseBills(supplierId)).map(b => ({
        date: new Date(b.billDate),
        type: 'BILL' as const,
        reference: b.billNumber,
        debit: b.amount,
        credit: 0,
        balance: 0,
        notes: b.notes
    }));

    const payments = (await getPurchasePayments(supplierId)).map(p => ({
        date: new Date(p.paymentDate),
        type: 'PAYMENT' as const,
        reference: p.paymentNumber,
        debit: 0,
        credit: p.amount,
        balance: 0,
        notes: p.notes
    }));

    let entries = [...bills, ...payments];

    if (startDate) {
        entries = entries.filter(e => e.date >= startDate);
    }
    if (endDate) {
        entries = entries.filter(e => e.date <= endDate);
    }

    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = 0;
    entries.forEach(entry => {
        runningBalance += entry.debit - entry.credit;
        entry.balance = runningBalance;
    });

    return entries;
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
    const bills = await getPurchaseBills(supplierId);
    const payments = await getPurchasePayments(supplierId);

    const totalBills = bills.reduce((sum, b) => sum + b.amount, 0);
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
    const newBalance = totalBills - totalPayments;

    const suppliers = getLocalData<SupplierData>(KEYS.SUPPLIERS);
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
