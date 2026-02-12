import { supabase } from './supabase';
import {
    SupplierData,
    PurchaseBillData,
    PurchasePaymentData,
    PurchaseAllocationData
} from '@/types';

// ============================================
// Mapper Functions (snake_case to camelCase)
// ============================================

function mapSupplier(data: any): SupplierData {
    return {
        id: data.id,
        name: data.name,
        contactPerson: data.contact_person,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        gstNumber: data.gst_number,
        balance: parseFloat(data.balance) || 0,
        lastTransactionDate: data.last_transaction_date ? new Date(data.last_transaction_date) : undefined,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
    };
}

function mapPurchaseBill(data: any): PurchaseBillData {
    return {
        id: data.id,
        supplierId: data.supplier_id,
        billNumber: data.bill_number,
        billDate: new Date(data.bill_date),
        amount: parseFloat(data.amount),
        paidAmount: parseFloat(data.paid_amount) || 0,
        balance: parseFloat(data.balance),
        dueDate: data.due_date ? new Date(data.due_date) : undefined,
        items: data.items,
        notes: data.notes,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
    };
}

function mapPurchasePayment(data: any): PurchasePaymentData {
    return {
        id: data.id,
        supplierId: data.supplier_id,
        paymentNumber: data.payment_number,
        paymentDate: new Date(data.payment_date),
        amount: parseFloat(data.amount),
        paymentMode: data.payment_mode,
        referenceNumber: data.reference_number,
        notes: data.notes,
        createdAt: new Date(data.created_at)
    };
}

function mapPurchaseAllocation(data: any): PurchaseAllocationData {
    return {
        id: data.id,
        billId: data.bill_id,
        billNumber: data.bill_number,
        paymentId: data.payment_id,
        paymentNumber: data.payment_number,
        amount: parseFloat(data.amount),
        allocationDate: new Date(data.allocation_date),
        createdAt: new Date(data.created_at)
    };
}

// ============================================
// Supplier Operations
// ============================================

export async function getAllSuppliers(): Promise<SupplierData[]> {
    const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching suppliers:', error);
        return [];
    }

    return data ? data.map(mapSupplier) : [];
}

export async function getSupplier(supplierId: string): Promise<SupplierData | null> {
    const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .single();

    if (error) {
        console.error('Error fetching supplier:', error);
        return null;
    }

    return data ? mapSupplier(data) : null;
}

export async function createSupplier(supplier: Omit<SupplierData, 'id' | 'createdAt' | 'updatedAt' | 'balance' | 'lastTransactionDate'>): Promise<SupplierData | null> {
    const { data, error } = await supabase
        .from('suppliers')
        .insert({
            name: supplier.name,
            contact_person: supplier.contactPerson,
            phone: supplier.phone,
            email: supplier.email,
            address: supplier.address,
            city: supplier.city,
            gst_number: supplier.gstNumber,
            balance: 0
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating supplier:', error);
        return null;
    }

    return data ? mapSupplier(data) : null;
}

export async function updateSupplier(supplierId: string, updates: Partial<SupplierData>): Promise<SupplierData | null> {
    const { data, error } = await supabase
        .from('suppliers')
        .update({
            name: updates.name,
            contact_person: updates.contactPerson,
            phone: updates.phone,
            email: updates.email,
            address: updates.address,
            city: updates.city,
            gst_number: updates.gstNumber
        })
        .eq('id', supplierId)
        .select()
        .single();

    if (error) {
        console.error('Error updating supplier:', error);
        return null;
    }

    return data ? mapSupplier(data) : null;
}

export async function deleteSupplier(supplierId: string): Promise<boolean> {
    const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplierId);

    if (error) {
        console.error('Error deleting supplier:', error);
        return false;
    }

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
    // Insert bill
    const { data: billData, error: billError } = await supabase
        .from('purchase_bills')
        .insert({
            supplier_id: bill.supplierId,
            bill_number: bill.billNumber,
            bill_date: bill.billDate.toISOString().split('T')[0],
            amount: bill.amount,
            paid_amount: 0,
            balance: bill.amount,
            due_date: bill.dueDate?.toISOString().split('T')[0],
            items: bill.items,
            notes: bill.notes
        })
        .select()
        .single();

    if (billError) {
        console.error('Error creating purchase bill:', billError);
        return null;
    }

    // Update supplier balance (increase by bill amount)
    const { data: supplier } = await supabase
        .from('suppliers')
        .select('balance')
        .eq('id', bill.supplierId)
        .single();

    if (supplier) {
        const newBalance = parseFloat(supplier.balance || '0') + bill.amount;
        await supabase
            .from('suppliers')
            .update({
                balance: newBalance,
                last_transaction_date: new Date().toISOString()
            })
            .eq('id', bill.supplierId);
    }

    return billData ? mapPurchaseBill(billData) : null;
}

export async function getPurchaseBills(supplierId?: string): Promise<PurchaseBillData[]> {
    let query = supabase
        .from('purchase_bills')
        .select('*')
        .order('bill_date', { ascending: false });

    if (supplierId) {
        query = query.eq('supplier_id', supplierId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching purchase bills:', error);
        return [];
    }

    return data ? data.map(mapPurchaseBill) : [];
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
    // 1. Insert payment record
    const { data: paymentData, error: paymentError } = await supabase
        .from('purchase_payments')
        .insert({
            supplier_id: payment.supplierId,
            payment_number: payment.paymentNumber,
            payment_date: payment.paymentDate.toISOString().split('T')[0],
            amount: payment.amount,
            payment_mode: payment.paymentMode,
            reference_number: payment.referenceNumber,
            notes: payment.notes
        })
        .select()
        .single();

    if (paymentError) {
        console.error('Error creating payment:', paymentError);
        return null;
    }

    // 2. Apply FIFO allocation
    await applyFIFOAllocation(payment.supplierId, paymentData.id, payment.paymentNumber, payment.amount, payment.paymentDate);

    // 3. Update supplier balance (decrease by payment amount)
    const { data: supplier } = await supabase
        .from('suppliers')
        .select('balance')
        .eq('id', payment.supplierId)
        .single();

    if (supplier) {
        const newBalance = parseFloat(supplier.balance || '0') - payment.amount;
        await supabase
            .from('suppliers')
            .update({
                balance: newBalance,
                last_transaction_date: new Date().toISOString()
            })
            .eq('id', payment.supplierId);
    }

    return paymentData ? mapPurchasePayment(paymentData) : null;
}

async function applyFIFOAllocation(
    supplierId: string,
    paymentId: string,
    paymentNumber: string,
    paymentAmount: number,
    paymentDate: Date
) {
    // Get all unpaid bills for this supplier (oldest first)
    const { data: bills, error } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('supplier_id', supplierId)
        .gt('balance', 0)
        .order('bill_date', { ascending: true });

    if (error || !bills) {
        console.error('Error fetching bills for FIFO:', error);
        return;
    }

    let remainingAmount = paymentAmount;

    for (const bill of bills) {
        if (remainingAmount <= 0) break;

        const billBalance = parseFloat(bill.balance);
        const allocationAmount = Math.min(remainingAmount, billBalance);

        // Create allocation record
        await supabase
            .from('purchase_allocations')
            .insert({
                bill_id: bill.id,
                bill_number: bill.bill_number,
                payment_id: paymentId,
                payment_number: paymentNumber,
                amount: allocationAmount,
                allocation_date: paymentDate.toISOString().split('T')[0]
            });

        // Update bill paid_amount and balance
        const newPaidAmount = parseFloat(bill.paid_amount) + allocationAmount;
        const newBalance = parseFloat(bill.amount) - newPaidAmount;

        await supabase
            .from('purchase_bills')
            .update({
                paid_amount: newPaidAmount,
                balance: newBalance
            })
            .eq('id', bill.id);

        remainingAmount -= allocationAmount;
    }
}

export async function getPurchasePayments(supplierId?: string): Promise<PurchasePaymentData[]> {
    let query = supabase
        .from('purchase_payments')
        .select('*')
        .order('payment_date', { ascending: false });

    if (supplierId) {
        query = query.eq('supplier_id', supplierId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching payments:', error);
        return [];
    }

    return data ? data.map(mapPurchasePayment) : [];
}

// ============================================
// Supplier Statement
// ============================================

export interface SupplierStatementEntry {
    date: Date;
    type: 'BILL' | 'PAYMENT';
    reference: string;
    debit: number;  // Bills increase what we owe
    credit: number; // Payments decrease what we owe
    balance: number;
    notes?: string;
}

export async function getSupplierStatement(
    supplierId: string,
    startDate?: Date,
    endDate?: Date
): Promise<SupplierStatementEntry[]> {
    // Fetch bills
    let billsQuery = supabase
        .from('purchase_bills')
        .select('*')
        .eq('supplier_id', supplierId);

    if (startDate) {
        billsQuery = billsQuery.gte('bill_date', startDate.toISOString().split('T')[0]);
    }
    if (endDate) {
        billsQuery = billsQuery.lte('bill_date', endDate.toISOString().split('T')[0]);
    }

    const { data: bills } = await billsQuery;

    // Fetch payments
    let paymentsQuery = supabase
        .from('purchase_payments')
        .select('*')
        .eq('supplier_id', supplierId);

    if (startDate) {
        paymentsQuery = paymentsQuery.gte('payment_date', startDate.toISOString().split('T')[0]);
    }
    if (endDate) {
        paymentsQuery = paymentsQuery.lte('payment_date', endDate.toISOString().split('T')[0]);
    }

    const { data: payments } = await paymentsQuery;

    // Combine and sort
    const entries: SupplierStatementEntry[] = [];

    bills?.forEach(bill => {
        entries.push({
            date: new Date(bill.bill_date),
            type: 'BILL',
            reference: bill.bill_number,
            debit: parseFloat(bill.amount),
            credit: 0,
            balance: 0, // Will calculate below
            notes: bill.notes
        });
    });

    payments?.forEach(payment => {
        entries.push({
            date: new Date(payment.payment_date),
            type: 'PAYMENT',
            reference: payment.payment_number,
            debit: 0,
            credit: parseFloat(payment.amount),
            balance: 0,
            notes: payment.notes
        });
    });

    // Sort by date
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate running balance
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
    const { data, error } = await supabase
        .from('suppliers')
        .select('balance');

    if (error) {
        console.error('Error fetching total payables:', error);
        return 0;
    }

    return data?.reduce((sum, s) => sum + parseFloat(s.balance || '0'), 0) || 0;
}
