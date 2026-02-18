
import { Transaction, TransactionType, InvoiceItem, Product } from '@/types';

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
    note?: string;
    agentName?: string;
}

export function calculateDealerStatement(transactions: Transaction[]) {
    // 1. Separate Invoices and Payments
    const invoices: InvoiceStatement[] = [];
    const payments: PaymentStatement[] = [];

    // Sort transactions by date ascending to apply FIFO correctly
    const sortedTxns = [...transactions].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const today = new Date();

    sortedTxns.forEach(txn => {
        if (txn.type === TransactionType.INVOICE) {
            const dueDate = txn.dueDate ? new Date(txn.dueDate) : null;
            // Calculate days pending
            const daysPending = Math.ceil((today.getTime() - new Date(txn.date).getTime()) / (1000 * 60 * 60 * 24));

            invoices.push({
                id: txn.id,
                date: new Date(txn.date),
                referenceId: txn.referenceId || 'N/A',
                amount: txn.amount,
                paid: 0,
                balance: txn.amount,
                daysPending: daysPending,
                creditDays: txn.creditDays || 30,
                dueDate: dueDate,
                isOverdue: dueDate ? today > dueDate : false,
                paidDate: null,
                daysToPay: null,
                originalTransaction: txn
            });
        } else if (txn.type === TransactionType.PAYMENT) {
            payments.push({
                id: txn.id,
                date: new Date(txn.date),
                referenceId: txn.referenceId || 'N/A',
                amount: txn.amount,
                remaining: txn.amount,
                note: txn.notes,
                agentName: txn.agentName
            });
        }
    });

    // 2. Apply FIFO Logic
    // Iterate through payments and apply to oldest invoices first
    payments.forEach(payment => {
        let remainingPayment = payment.remaining;

        for (const invoice of invoices) {
            if (remainingPayment <= 0) break;
            if (invoice.balance <= 0) continue; // Already paid

            const amountToApply = Math.min(remainingPayment, invoice.balance);

            invoice.paid += amountToApply;
            invoice.balance -= amountToApply;
            remainingPayment -= amountToApply;

            // If invoice is fully paid by this payment
            if (invoice.balance <= 0.01 && invoice.paidDate === null) { // epsilon for float
                invoice.paidDate = payment.date;
                invoice.daysToPay = Math.ceil((payment.date.getTime() - invoice.date.getTime()) / (1000 * 60 * 60 * 24));
                invoice.isOverdue = false;
            }
        }
    });

    // 3. Return structured data
    return {
        invoices,
        payments,
        summary: {
            totalInvoiced: invoices.reduce((sum, inv) => sum + inv.amount, 0),
            totalPaid: invoices.reduce((sum, inv) => sum + inv.paid, 0),
            totalOutstanding: invoices.reduce((sum, inv) => sum + inv.balance, 0),
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
    if (!items || items.length === 0) {
        console.log('[COGS] No items provided');
        return 0;
    }

    console.log(`[COGS] Calculating for ${items.length} items with ${products.length} products`);
    let totalCOGS = 0;
    items.forEach(item => {
        const product = products.find(p => p.id === item.productId || p.productId === item.productId);
        const costPrice = Number(product?.costPrice) || 0;
        const itemCOGS = costPrice * item.quantity;
        console.log(`[COGS] Item: ${item.productName}, Qty: ${item.quantity}, Cost: ${costPrice}, COGS: ${itemCOGS}`);
        totalCOGS += itemCOGS;
    });

    console.log(`[COGS] Total COGS: ${totalCOGS}`);
    return totalCOGS;
}


/**
 * Calculate profit for a single invoice
 */
export function calculateInvoiceProfit(
    invoice: Transaction,
    products: Product[],
    agentExpenses: number = 0
): ProfitCalculation {
    const revenue = invoice.amount;
    // Prefer stored COGS if available, fallback to recalculation
    const cogs = (invoice.cogs && invoice.cogs > 0) ? invoice.cogs : calculateCOGS(invoice.items || [], products);
    const serviceCharges = invoice.transportCharges || 0;
    const dealerDiscountPercent = invoice.discountPercent || 0;

    // Calculate gross profit before discount
    // Note: serviceCharges (transport) are treated as profit since company uses its own transport (SV Transport)
    const grossProfit = revenue - cogs - agentExpenses;

    // Calculate dealer discount amount
    const dealerDiscount = (grossProfit * dealerDiscountPercent) / 100;

    // Net profit after all expenses and discounts
    const netProfit = grossProfit - dealerDiscount;

    // Profit percentage
    const profitPercentage = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
        revenue,
        cogs,
        serviceCharges,
        agentExpenses,
        grossProfit,
        dealerDiscount,
        netProfit,
        profitPercentage
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
        totalRevenue += profit.revenue;
        totalProfit += profit.netProfit;
        totalDiscounts += profit.dealerDiscount;
    });

    const overallProfitPercentage = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const averageProfitPerInvoice = invoices.length > 0 ? totalProfit / invoices.length : 0;

    return {
        totalRevenue,
        totalProfit,
        totalDiscounts,
        overallProfitPercentage,
        averageProfitPerInvoice,
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
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2
    }).format(amount);
}

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
