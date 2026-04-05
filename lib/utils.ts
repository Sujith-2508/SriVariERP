
import { Transaction, TransactionType, InvoiceItem, Product } from '@/types';

const DAY_IN_MS = 1000 * 60 * 60 * 24;

function asFiniteNumber(value: unknown, fallback = 0): number {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
}

function parseSafeDate(value: unknown, fallback: Date): Date {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value as any);
    return Number.isNaN(parsed.getTime()) ? new Date(fallback.getTime()) : parsed;
}

function normalizeReferenceId(value: unknown): string {
    const ref = typeof value === 'string' ? value.trim() : '';
    return ref || 'N/A';
}

const STATE_ALIASES: Array<{ canonical: string; patterns: string[] }> = [
    { canonical: 'TAMIL NADU', patterns: ['TAMILNADU', 'TAMIL NADU', 'TN'] },
    { canonical: 'KERALA', patterns: ['KERALA', 'KL'] },
    { canonical: 'KARNATAKA', patterns: ['KARNATAKA', 'KA'] },
    { canonical: 'ANDHRA PRADESH', patterns: ['ANDHRAPRADESH', 'ANDHRA PRADESH', 'AP'] },
    { canonical: 'TELANGANA', patterns: ['TELANGANA', 'TG', 'TS'] },
    { canonical: 'MAHARASHTRA', patterns: ['MAHARASHTRA', 'MH'] },
];

function normalizeStateToken(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.toUpperCase().replace(/[^A-Z]/g, '');
}

export function normalizeIndianStateName(value: string | undefined | null): string {
    const token = normalizeStateToken(value);
    if (!token) return '';

    for (const state of STATE_ALIASES) {
        if (state.patterns.some(pattern => token.includes(normalizeStateToken(pattern)))) {
            return state.canonical;
        }
    }

    return token;
}

export function shouldApplyIGST(companyState?: string | null, dealerState?: string | null): boolean {
    const normalizedCompany = normalizeIndianStateName(companyState || '');
    const normalizedDealer = normalizeIndianStateName(dealerState || '');

    if (!normalizedCompany || !normalizedDealer) return false;
    return normalizedCompany !== normalizedDealer;
}

function isChequeReturnNotes(notes?: string): boolean {
    const noteText = String(notes || '').trim();
    if (!noteText) return false;

    if (
        noteText.startsWith('Cheque Return') ||
        noteText.startsWith('Check Return') ||
        noteText.startsWith('Chq Return')
    ) {
        return true;
    }

    try {
        const parsed = JSON.parse(noteText);
        return Boolean(parsed?.isChequeReturn);
    } catch {
        return false;
    }
}

export function isChequeReturnTransaction(txn: Pick<Transaction, 'type' | 'notes'>): boolean {
    return txn.type === TransactionType.INVOICE && isChequeReturnNotes(txn.notes);
}

export function isSalesInvoiceTransaction(txn: Pick<Transaction, 'type' | 'referenceId' | 'notes'>): boolean {
    return txn.type === TransactionType.INVOICE && normalizeReferenceId(txn.referenceId) !== 'BAL B/F' && !isChequeReturnNotes(txn.notes);
}

/**
 * Returns today's date as a YYYY-MM-DD string in IST (Asia/Kolkata, UTC+5:30).
 * Use this everywhere you need "today's date" to avoid UTC date drift.
 * e.g. at 11:45 PM IST, new Date().toISOString() gives the PREVIOUS day (wrong).
 */
export function getISTDateString(date: Date = new Date()): string {
    const safeDate = parseSafeDate(date, new Date());
    return safeDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    // en-CA locale formats as YYYY-MM-DD which HTML date inputs accept directly
}


export interface InvoiceStatement {
    id: string;
    date: Date;
    referenceId: string;
    amount: number;
    paid: number;
    balance: number;
    daysPending: number;
    creditDays: number;
    dueDate: Date | null;
    isOverdue: boolean;
    paidDate: Date | null;
    daysToPay: number | null;
    originalTransaction: Transaction;
}

export interface PaymentStatement {
    id: string;
    date: Date;
    referenceId: string;
    amount: number;
    remaining: number; // For calculation purposes
    notes?: string;
    agentName?: string;
    originalTransaction: Transaction;
}

export function calculateDealerStatement(transactions: Transaction[], openingBalance: number = 0, openingBalanceDate?: Date | string) {
    // 1. Separate Invoices and Payments
    const invoices: InvoiceStatement[] = [];
    const payments: PaymentStatement[] = [];
    const today = new Date();
    const normalizedOpeningBalance = asFiniteNumber(openingBalance, 0);

    // Sort transactions by date ascending to apply FIFO correctly
    const sortedTxns = [...transactions].sort((a, b) => {
        const fallbackA = parseSafeDate(a.createdAt, new Date(0));
        const fallbackB = parseSafeDate(b.createdAt, new Date(0));
        const dateA = parseSafeDate(a.date, fallbackA).getTime();
        const dateB = parseSafeDate(b.date, fallbackB).getTime();
        if (dateA !== dateB) return dateA - dateB;

        // Special case: BAL B/F always first among same-day transactions
        const refA = normalizeReferenceId(a.referenceId);
        const refB = normalizeReferenceId(b.referenceId);
        if (refA === 'BAL B/F') return -1;
        if (refB === 'BAL B/F') return 1;

        // Fallback to creation time for same-day transactions
        const createdA = parseSafeDate(a.createdAt, new Date(0)).getTime();
        const createdB = parseSafeDate(b.createdAt, new Date(0)).getTime();
        return createdA - createdB;
    });

    sortedTxns.forEach(txn => {
        const txnDate = parseSafeDate(txn.date, today);
        const txnAmount = asFiniteNumber(txn.amount, 0);
        if (txnAmount < 0) return;

        if (txn.type === TransactionType.INVOICE) {
            const dueDate = txn.dueDate ? parseSafeDate(txn.dueDate, txnDate) : null;
            // Calculate days pending
            const daysPending = Math.max(0, Math.ceil((today.getTime() - txnDate.getTime()) / DAY_IN_MS));
            const normalizedAmount = roundCurrency(txnAmount);
            const normalizedCreditDaysRaw = asFiniteNumber(txn.creditDays, 30);
            const normalizedCreditDays = normalizedCreditDaysRaw > 0 ? Math.floor(normalizedCreditDaysRaw) : 30;

            invoices.push({
                id: txn.id,
                date: txnDate,
                referenceId: normalizeReferenceId(txn.referenceId),
                amount: normalizedAmount,
                paid: 0,
                balance: normalizedAmount,
                daysPending: daysPending,
                creditDays: normalizedCreditDays,
                dueDate: dueDate,
                isOverdue: dueDate ? (today > dueDate && normalizedAmount > 0) : false,
                paidDate: null,
                daysToPay: null,
                originalTransaction: txn
            });
        } else if (txn.type === TransactionType.PAYMENT) {
            const normalizedAmount = roundCurrency(txnAmount);
            payments.push({
                id: txn.id,
                date: txnDate,
                referenceId: normalizeReferenceId(txn.referenceId),
                amount: normalizedAmount,
                remaining: normalizedAmount,
                notes: txn.notes,
                agentName: txn.agentName,
                originalTransaction: txn
            });
        }
    });

    // 2. Apply FIFO Logic
    // Iterate through payments and apply to oldest invoices first
    payments.forEach(payment => {
        let remainingPayment = roundCurrency(Math.max(0, payment.remaining));

        for (const invoice of invoices) {
            if (remainingPayment <= 0.001) break; // Use epsilon for float comparison
            if (invoice.balance <= 0.001) continue; // Already paid

            // Calculate amount to apply with precision
            let amountToApply = Math.min(remainingPayment, invoice.balance);

            // Fix precision
            amountToApply = roundCurrency(amountToApply);

            invoice.paid += amountToApply;
            invoice.balance -= amountToApply;
            remainingPayment -= amountToApply;

            // Fix precision after subtraction
            invoice.paid = roundCurrency(invoice.paid);
            invoice.balance = roundCurrency(invoice.balance);
            remainingPayment = roundCurrency(remainingPayment);

            // If invoice is fully paid by this payment (allowing for small float error)
            if (invoice.balance <= 0.01 && invoice.paidDate === null) {
                invoice.balance = 0; // Force to 0 if very close
                invoice.paidDate = payment.date;
                invoice.daysToPay = Math.max(0, Math.ceil((payment.date.getTime() - invoice.date.getTime()) / DAY_IN_MS));
                invoice.isOverdue = false;
            }
        }
        payment.remaining = Math.max(0, remainingPayment);
    });

    // 3. Return structured data with summary precision fixed
    // IMPORTANT: If we have a 'BAL B/F' transaction, it's already in the 'invoices' array.
    // We filter it out of 'totalInvoiced' to avoid double-counting when we add 'openingBalance' in line 138.
    const totalInvoiced = invoices.filter(inv => inv.referenceId !== 'BAL B/F').reduce((sum, inv) => sum + inv.amount, 0);
    const totalPaidOnInvoices = invoices.reduce((sum, inv) => sum + inv.paid, 0);
    const totalUnapplied = payments.reduce((sum, p) => sum + p.remaining, 0);

    // Total outstanding is Net Balance: Opening Balance + Total Invoiced - Total Paid
    // Positive if dealer owes us, negative if we owe dealer (advance)
    const totalOutstanding = normalizedOpeningBalance + totalInvoiced - (totalPaidOnInvoices + totalUnapplied);

    return {
        invoices,
        payments,
        summary: {
            openingBalance: roundCurrency(normalizedOpeningBalance),
            openingBalanceDate,
            totalInvoiced: roundCurrency(totalInvoiced),
            totalPaid: roundCurrency(totalPaidOnInvoices + totalUnapplied),
            totalOutstanding: roundCurrency(totalOutstanding),
            totalUnapplied: roundCurrency(totalUnapplied),
            overdueCount: invoices.filter(inv => inv.isOverdue && inv.balance > 0).length
        }
    };
}

// ============================================================================
// PROFIT CALCULATION UTILITIES
// ============================================================================

export interface ProfitCalculation {
    revenue: number;
    cogs: number;
    serviceCharges: number;
    agentExpenses: number;
    grossProfit: number;
    dealerDiscount: number;
    netProfit: number;
    profitPercentage: number;
}

export interface DealerProfitSummary {
    totalRevenue: number;
    totalProfit: number;
    totalDiscounts: number;
    overallProfitPercentage: number;
    averageProfitPerInvoice: number;
    invoiceCount: number;
}

export function calculateCOGS(items: InvoiceItem[], products: Product[]): number {
    if (!Array.isArray(items) || items.length === 0) {
        return 0;
    }

    const safeProducts = Array.isArray(products) ? products : [];
    let totalCOGS = 0;
    items.forEach(item => {
        const quantity = Math.max(0, asFiniteNumber(item.quantity, 0));
        if (quantity <= 0) return;

        // PRIMARY: Use costPrice stored on the item itself (captured at billing time)
        // FALLBACK: Look up the product in the catalog by ID, then by name
        let costPrice = 0;
        const itemCostPrice = asFiniteNumber(item.costPrice, 0);
        if (itemCostPrice > 0) {
            costPrice = itemCostPrice;
        } else {
            const normalizedProductName = (item.productName || '').trim().toLowerCase();
            const product = safeProducts.find(p =>
                p.id === item.productId ||
                p.productId === item.productId ||
                p.name?.trim().toLowerCase() === normalizedProductName
            );
            costPrice = Math.max(0, asFiniteNumber(product?.costPrice, 0));
        }
        const itemCOGS = roundCurrency(costPrice * quantity);
        totalCOGS += itemCOGS;
    });

    return roundCurrency(totalCOGS);
}



/**
 * Calculate profit for a single invoice
 */
export function calculateInvoiceProfit(
    invoice: Transaction,
    products: Product[],
    agentExpenses: number = 0
): ProfitCalculation {
    // Cheque returns are reversals of bounced payments — zero profit, zero revenue impact
    const isChequeReturn = isChequeReturnTransaction(invoice);

    if (isChequeReturn) {
        return { revenue: 0, cogs: 0, serviceCharges: 0, agentExpenses: 0, grossProfit: 0, dealerDiscount: 0, netProfit: 0, profitPercentage: 0 };
    }

    const revenue = Math.max(0, asFiniteNumber(invoice.amount, 0));
    // Prefer stored COGS if available, fallback to recalculation
    const invoiceCogs = asFiniteNumber(invoice.cogs, 0);
    const cogs = invoiceCogs > 0 ? invoiceCogs : calculateCOGS(invoice.items || [], products);
    const serviceCharges = Math.max(0, asFiniteNumber(invoice.transportCharges, 0));
    const normalizedAgentExpenses = Math.max(0, asFiniteNumber(agentExpenses, 0));
    const dealerDiscountPercent = Math.min(100, Math.max(0, asFiniteNumber(invoice.discountPercent, 0)));

    // Calculate gross profit before discount
    // Note: serviceCharges (transport) are treated as profit since company uses its own transport (SV Transport)
    const grossProfit = roundCurrency(revenue - cogs - normalizedAgentExpenses);

    // Calculate dealer discount amount
    const dealerDiscount = roundCurrency((grossProfit * dealerDiscountPercent) / 100);

    // Net profit after all expenses and discounts
    const netProfit = roundCurrency(grossProfit - dealerDiscount);

    // Profit percentage
    const profitPercentage = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
        revenue,
        cogs: roundCurrency(cogs),
        serviceCharges,
        agentExpenses: normalizedAgentExpenses,
        grossProfit,
        dealerDiscount,
        netProfit,
        profitPercentage: roundCurrency(profitPercentage)
    };
}

/**
 * Calculate overall profit summary for a dealer
 */
export function getDealerProfitSummary(
    transactions: Transaction[],
    products: Product[]
): DealerProfitSummary {
    const invoices = transactions.filter(t => t.type === TransactionType.INVOICE);

    let totalRevenue = 0;
    let totalProfit = 0;
    let totalDiscounts = 0;

    invoices.forEach(invoice => {
        const profit = calculateInvoiceProfit(invoice, products);
        totalRevenue += asFiniteNumber(profit.revenue, 0);
        totalProfit += asFiniteNumber(profit.netProfit, 0);
        totalDiscounts += asFiniteNumber(profit.dealerDiscount, 0);
    });

    const overallProfitPercentage = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const averageProfitPerInvoice = invoices.length > 0 ? totalProfit / invoices.length : 0;

    return {
        totalRevenue: roundCurrency(totalRevenue),
        totalProfit: roundCurrency(totalProfit),
        totalDiscounts: roundCurrency(totalDiscounts),
        overallProfitPercentage: roundCurrency(overallProfitPercentage),
        averageProfitPerInvoice: roundCurrency(averageProfitPerInvoice),
        invoiceCount: invoices.length
    };
}

/**
 * Get profit color based on profit percentage
 */
export function getProfitColor(profitPercentage: number): string {
    if (profitPercentage >= 20) return 'text-green-600';
    if (profitPercentage >= 10) return 'text-yellow-600';
    return 'text-red-600';
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
    const safeAmount = asFiniteNumber(amount, 0);
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2
    }).format(safeAmount);
}

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
