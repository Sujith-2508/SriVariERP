'use client';

import React, { createContext, useContext, useState } from 'react';
import { Dealer, Product, Transaction, TransactionType, InvoiceItem, Agent, PaymentAllocation } from '@/types';
import { MOCK_DEALERS, MOCK_PRODUCTS, MOCK_TRANSACTIONS, MOCK_AGENTS, generateInvoiceNumber, generateReceiptNumber, generateProductId } from '@/constants';

interface InvoiceData {
    vehicleName?: string;
    vehicleNumber?: string;
    destination?: string;
    transportCharges?: number;
    paymentTerms?: string;
    discountPercent?: number;
    creditDays?: number;  // NEW: Credit days for due date calculation
}

interface DataContextType {
    products: Product[];
    dealers: Dealer[];
    transactions: Transaction[];
    agents: Agent[];
    invoiceCount: number;
    receiptCount: number;
    productCount: number;
    // Methods
    createInvoice: (dealerId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => Promise<string>;
    recordPayment: (dealerId: string, amount: number, method: string, agentName?: string, reference?: string) => Promise<string>;
    updateStock: (productId: string, quantity: number) => void;
    addProduct: (product: Omit<Product, 'id' | 'productId'>) => void;
    updateProduct: (product: Product) => void;
    deleteProduct: (id: string) => void;
    addDealer: (dealer: Omit<Dealer, 'id'>) => string;
    updateDealer: (dealer: Dealer) => void;
    deleteDealer: (id: string) => void;
    getDealerTransactions: (dealerId: string) => Transaction[];
    getInvoicePaymentHistory: (invoiceId: string) => PaymentAllocation[];
    // Backward compatible aliases
    customers: Dealer[];
    addCustomer: (customer: Omit<Dealer, 'id'>) => string;
    deleteCustomer: (id: string) => void;
    getCustomerTransactions: (customerId: string) => Transaction[];
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
    const [dealers, setDealers] = useState<Dealer[]>(MOCK_DEALERS);
    const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
    const [agents] = useState<Agent[]>(MOCK_AGENTS);

    // Sequential counters - starting after mock data
    const [invoiceCount, setInvoiceCount] = useState(6); // After INV005
    const [receiptCount, setReceiptCount] = useState(2); // After R001
    const [productCount, setProductCount] = useState(6); // After PDI-005

    const updateStock = (productId: string, quantity: number) => {
        setProducts(prev => prev.map(p =>
            p.id === productId ? { ...p, stock: p.stock - quantity } : p
        ));
    };

    const addProduct = (productData: Omit<Product, 'id' | 'productId'>) => {
        const newProductId = generateProductId(productCount);
        const newProduct: Product = {
            ...productData,
            id: `p${Date.now()}`,
            productId: newProductId
        };
        setProducts(prev => [newProduct, ...prev]);
        setProductCount(prev => prev + 1);
    };

    const updateProduct = (updatedProduct: Product) => {
        setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    };

    const deleteProduct = (id: string) => {
        setProducts(prev => prev.filter(p => p.id !== id));
    };

    const addDealer = (dealerData: Omit<Dealer, 'id'>) => {
        const newId = `d${Date.now()}`;
        const newDealer: Dealer = { ...dealerData, id: newId };
        setDealers(prev => [newDealer, ...prev]);
        return newId;
    };

    const updateDealer = (updatedDealer: Dealer) => {
        setDealers(prev => prev.map(d => d.id === updatedDealer.id ? updatedDealer : d));
    };

    const deleteDealer = (id: string) => {
        setTransactions(prev => prev.filter(t => t.customerId !== id));
        setDealers(prev => prev.filter(d => d.id !== id));
    };

    const getDealerTransactions = (dealerId: string): Transaction[] => {
        return transactions
            .filter(t => t.customerId === dealerId)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };

    // Get all payments that were applied to a specific invoice
    const getInvoicePaymentHistory = (invoiceId: string): PaymentAllocation[] => {
        const allAllocations: PaymentAllocation[] = [];

        transactions.forEach(txn => {
            if (txn.type === TransactionType.PAYMENT && txn.paymentAllocations) {
                txn.paymentAllocations
                    .filter(alloc => alloc.invoiceId === invoiceId)
                    .forEach(alloc => allAllocations.push(alloc));
            }
        });

        return allAllocations.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };

    const createInvoice = async (dealerId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => {
        const invoiceNumber = generateInvoiceNumber(invoiceCount);
        const invoiceDate = new Date();

        // Calculate due date from credit days
        const creditDays = invoiceData?.creditDays || 30; // Default 30 days
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + creditDays);

        const newTxn: Transaction = {
            id: `inv-${Date.now()}`,
            customerId: dealerId,
            type: TransactionType.INVOICE,
            amount: totalAmount,
            date: invoiceDate,
            referenceId: invoiceNumber,
            items,
            creditDays: creditDays,
            dueDate: dueDate,
            vehicleName: invoiceData?.vehicleName,
            vehicleNumber: invoiceData?.vehicleNumber,
            destination: invoiceData?.destination,
            transportCharges: invoiceData?.transportCharges,
            paymentTerms: invoiceData?.paymentTerms,
            discountPercent: invoiceData?.discountPercent,
        };

        setTransactions(prev => [newTxn, ...prev]);
        setInvoiceCount(prev => prev + 1);

        setDealers(prev => prev.map(d =>
            d.id === dealerId ? { ...d, balance: d.balance + totalAmount, lastTransactionDate: new Date() } : d
        ));

        items.forEach(item => {
            updateStock(item.productId, item.quantity);
        });

        return invoiceNumber;
    };

    const recordPayment = async (dealerId: string, amount: number, method: string, agentName?: string, reference?: string) => {
        const receiptNumber = reference || generateReceiptNumber(receiptCount);
        const paymentDate = new Date();
        const paymentId = `pay-${Date.now()}`;

        // FIFO: Get all unpaid/partially paid invoices for this dealer, sorted by date
        const dealerInvoices = transactions
            .filter(t => t.customerId === dealerId && t.type === TransactionType.INVOICE)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate current balances using FIFO
        const invoiceBalances = new Map<string, number>();
        dealerInvoices.forEach(inv => {
            invoiceBalances.set(inv.id, inv.amount);
        });

        // Subtract existing payments
        transactions
            .filter(t => t.customerId === dealerId && t.type === TransactionType.PAYMENT)
            .forEach(payment => {
                if (payment.paymentAllocations) {
                    payment.paymentAllocations.forEach(alloc => {
                        const currentBalance = invoiceBalances.get(alloc.invoiceId) || 0;
                        invoiceBalances.set(alloc.invoiceId, currentBalance - alloc.amount);
                    });
                }
            });

        // Apply new payment using FIFO
        const paymentAllocations: PaymentAllocation[] = [];
        let remainingAmount = amount;

        for (const invoice of dealerInvoices) {
            if (remainingAmount <= 0) break;

            const invoiceBalance = invoiceBalances.get(invoice.id) || 0;
            if (invoiceBalance <= 0) continue;

            const amountToApply = Math.min(remainingAmount, invoiceBalance);

            paymentAllocations.push({
                invoiceId: invoice.id,
                invoiceRef: invoice.referenceId || 'N/A',
                receiptId: paymentId,
                receiptRef: receiptNumber,
                amount: amountToApply,
                date: paymentDate,
                agentName: agentName || 'Admin'
            });

            remainingAmount -= amountToApply;
        }

        const newTxn: Transaction = {
            id: paymentId,
            customerId: dealerId,
            type: TransactionType.PAYMENT,
            amount: amount,
            date: paymentDate,
            referenceId: receiptNumber,
            notes: `via ${method}`,
            agentName: agentName || 'Admin',
            collectionDate: paymentDate,
            paymentAllocations: paymentAllocations,
        };

        setTransactions(prev => [newTxn, ...prev]);
        if (!reference) {
            setReceiptCount(prev => prev + 1);
        }

        setDealers(prev => prev.map(d =>
            d.id === dealerId ? { ...d, balance: d.balance - amount, lastTransactionDate: new Date() } : d
        ));

        return receiptNumber;
    };

    // Backward compatible aliases
    const customers = dealers;
    const addCustomer = addDealer;
    const deleteCustomer = deleteDealer;
    const getCustomerTransactions = getDealerTransactions;

    return (
        <DataContext.Provider value={{
            products,
            dealers,
            customers,
            transactions,
            agents,
            invoiceCount,
            receiptCount,
            productCount,
            createInvoice,
            recordPayment,
            updateStock,
            addProduct,
            updateProduct,
            deleteProduct,
            addDealer,
            updateDealer,
            deleteDealer,
            getDealerTransactions,
            getInvoicePaymentHistory,
            addCustomer,
            deleteCustomer,
            getCustomerTransactions
        }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};
