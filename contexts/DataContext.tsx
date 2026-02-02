'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Dealer, Product, Transaction, TransactionType, InvoiceItem, Agent, PaymentAllocation } from '@/types';
import { supabase } from '@/lib/supabase';

interface InvoiceData {
    vehicleName?: string;
    vehicleNumber?: string;
    destination?: string;
    transportCharges?: number;
    paymentTerms?: string;
    discountPercent?: number;
    creditDays?: number;
}

interface DataContextType {
    products: Product[];
    dealers: Dealer[];
    transactions: Transaction[];
    agents: Agent[];
    invoiceCount: number;
    receiptCount: number;
    productCount: number;
    isLoading: boolean;
    error: string | null;
    // Methods
    createInvoice: (dealerId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => Promise<string>;
    recordPayment: (dealerId: string, amount: number, method: string, agentName?: string, reference?: string) => Promise<string>;
    updateStock: (productId: string, quantity: number) => void;
    addProduct: (product: Omit<Product, 'id' | 'productId'>) => Promise<void>;
    updateProduct: (product: Product) => Promise<void>;
    deleteProduct: (id: string) => Promise<void>;
    addDealer: (dealer: Omit<Dealer, 'id'>) => Promise<string>;
    updateDealer: (dealer: Dealer) => Promise<void>;
    deleteDealer: (id: string) => Promise<void>;
    getDealerTransactions: (dealerId: string) => Transaction[];
    getInvoicePaymentHistory: (invoiceId: string) => PaymentAllocation[];
    refreshData: () => Promise<void>;
    // Agent methods
    addAgent: (agent: Omit<Agent, 'id'>) => Promise<string>;
    updateAgent: (agent: Agent) => Promise<void>;
    deleteAgent: (id: string) => Promise<void>;
    // Backward compatible aliases
    customers: Dealer[];
    addCustomer: (customer: Omit<Dealer, 'id'>) => Promise<string>;
    deleteCustomer: (id: string) => Promise<void>;
    getCustomerTransactions: (customerId: string) => Transaction[];
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Transform database row to app types
const transformProduct = (row: any): Product => ({
    id: row.id,
    productId: row.product_id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    stock: Number(row.stock),
    gstRate: Number(row.gst_rate),
    sku: row.sku,
});

const transformDealer = (row: any): Dealer => ({
    id: row.id,
    businessName: row.business_name,
    contactPerson: row.contact_person,
    phone: row.phone,
    district: row.district,
    city: row.city,
    pinCode: row.pin_code,
    address: row.address,
    gstNumber: row.gst_number,
    balance: Number(row.balance) || 0,
    lastTransactionDate: row.last_transaction_date ? new Date(row.last_transaction_date) : undefined,
});

const transformTransaction = (row: any): Transaction => ({
    id: row.id,
    customerId: row.customer_id,
    type: row.type as TransactionType,
    amount: Number(row.amount),
    date: new Date(row.date),
    referenceId: row.reference_id,
    notes: row.notes,
    agentName: row.agent_name,
    collectionDate: row.collection_date ? new Date(row.collection_date) : undefined,
    creditDays: row.credit_days,
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    vehicleName: row.vehicle_name,
    vehicleNumber: row.vehicle_number,
    destination: row.destination,
    transportCharges: row.transport_charges ? Number(row.transport_charges) : undefined,
    paymentTerms: row.payment_terms,
    discountPercent: row.discount_percent ? Number(row.discount_percent) : undefined,
});

const transformAgent = (row: any): Agent => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    area: row.area,
    division: row.division,
    collectionTarget: row.collection_target ? Number(row.collection_target) : undefined,
    isActive: row.is_active,
});

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Sequential counters
    const [invoiceCount, setInvoiceCount] = useState(1);
    const [receiptCount, setReceiptCount] = useState(1);
    const [productCount, setProductCount] = useState(1);

    // Fetch all data from Supabase
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Fetch products
            const { data: productsData, error: productsError } = await supabase
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });

            if (productsError) throw productsError;

            // Fetch dealers
            const { data: dealersData, error: dealersError } = await supabase
                .from('dealers')
                .select('*')
                .order('business_name');

            if (dealersError) throw dealersError;

            // Fetch transactions
            const { data: transactionsData, error: transactionsError } = await supabase
                .from('transactions')
                .select('*')
                .order('date', { ascending: false });

            if (transactionsError) throw transactionsError;

            // Fetch agents
            const { data: agentsData, error: agentsError } = await supabase
                .from('agents')
                .select('*')
                .order('name');

            if (agentsError) throw agentsError;

            // Transform and set data
            setProducts(productsData?.map(transformProduct) || []);
            setDealers(dealersData?.map(transformDealer) || []);
            setTransactions(transactionsData?.map(transformTransaction) || []);
            setAgents(agentsData?.map(transformAgent) || []);

            // Calculate counts for numbering
            const invoices = transactionsData?.filter(t => t.type === 'INVOICE') || [];
            const payments = transactionsData?.filter(t => t.type === 'PAYMENT') || [];
            setInvoiceCount(invoices.length + 1);
            setReceiptCount(payments.length + 1);
            setProductCount((productsData?.length || 0) + 1);

        } catch (err: any) {
            console.error('Error fetching data from Supabase:', err);
            setError(err.message || 'Failed to fetch data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial data fetch
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const refreshData = async () => {
        await fetchData();
    };

    const updateStock = async (productId: string, quantity: number) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        const newStock = product.stock - quantity;

        const { error } = await supabase
            .from('products')
            .update({ stock: newStock })
            .eq('id', productId);

        if (error) {
            console.error('Error updating stock:', error);
            return;
        }

        setProducts(prev => prev.map(p =>
            p.id === productId ? { ...p, stock: newStock } : p
        ));
    };

    const addProduct = async (productData: Omit<Product, 'id' | 'productId'>) => {
        const newProductId = `PDI-${String(productCount).padStart(3, '0')}`;

        const { data, error } = await supabase
            .from('products')
            .insert({
                product_id: newProductId,
                name: productData.name,
                category: productData.category,
                price: productData.price,
                stock: productData.stock,
                gst_rate: productData.gstRate,
                sku: productData.sku,
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding product:', error);
            throw error;
        }

        setProducts(prev => [transformProduct(data), ...prev]);
        setProductCount(prev => prev + 1);
    };

    const updateProduct = async (updatedProduct: Product) => {
        const { error } = await supabase
            .from('products')
            .update({
                product_id: updatedProduct.productId,
                name: updatedProduct.name,
                category: updatedProduct.category,
                price: updatedProduct.price,
                stock: updatedProduct.stock,
                gst_rate: updatedProduct.gstRate,
                sku: updatedProduct.sku,
            })
            .eq('id', updatedProduct.id);

        if (error) {
            console.error('Error updating product:', error);
            throw error;
        }

        setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    };

    const deleteProduct = async (id: string) => {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting product:', error);
            throw error;
        }

        setProducts(prev => prev.filter(p => p.id !== id));
    };

    const addDealer = async (dealerData: Omit<Dealer, 'id'>): Promise<string> => {
        const { data, error } = await supabase
            .from('dealers')
            .insert({
                business_name: dealerData.businessName,
                contact_person: dealerData.contactPerson,
                phone: dealerData.phone,
                district: dealerData.district,
                city: dealerData.city,
                pin_code: dealerData.pinCode,
                address: dealerData.address,
                gst_number: dealerData.gstNumber,
                balance: dealerData.balance || 0,
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding dealer:', error);
            throw error;
        }

        const newDealer = transformDealer(data);
        setDealers(prev => [newDealer, ...prev]);
        return newDealer.id;
    };

    const updateDealer = async (updatedDealer: Dealer) => {
        const { error } = await supabase
            .from('dealers')
            .update({
                business_name: updatedDealer.businessName,
                contact_person: updatedDealer.contactPerson,
                phone: updatedDealer.phone,
                district: updatedDealer.district,
                city: updatedDealer.city,
                pin_code: updatedDealer.pinCode,
                address: updatedDealer.address,
                gst_number: updatedDealer.gstNumber,
                balance: updatedDealer.balance,
            })
            .eq('id', updatedDealer.id);

        if (error) {
            console.error('Error updating dealer:', error);
            throw error;
        }

        setDealers(prev => prev.map(d => d.id === updatedDealer.id ? updatedDealer : d));
    };

    const deleteDealer = async (id: string) => {
        // First delete related transactions
        await supabase
            .from('transactions')
            .delete()
            .eq('customer_id', id);

        const { error } = await supabase
            .from('dealers')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting dealer:', error);
            throw error;
        }

        setTransactions(prev => prev.filter(t => t.customerId !== id));
        setDealers(prev => prev.filter(d => d.id !== id));
    };

    const getDealerTransactions = (dealerId: string): Transaction[] => {
        return transactions
            .filter(t => t.customerId === dealerId)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };

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
        const invoiceNumber = `INV${String(invoiceCount).padStart(3, '0')}`;
        const invoiceDate = new Date();

        const creditDays = invoiceData?.creditDays || 30;
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + creditDays);

        // Insert transaction
        const { data: txnData, error: txnError } = await supabase
            .from('transactions')
            .insert({
                customer_id: dealerId,
                type: 'INVOICE',
                amount: totalAmount,
                date: invoiceDate.toISOString(),
                reference_id: invoiceNumber,
                credit_days: creditDays,
                due_date: dueDate.toISOString(),
                vehicle_name: invoiceData?.vehicleName,
                vehicle_number: invoiceData?.vehicleNumber,
                destination: invoiceData?.destination,
                transport_charges: invoiceData?.transportCharges,
                payment_terms: invoiceData?.paymentTerms,
                discount_percent: invoiceData?.discountPercent,
            })
            .select()
            .single();

        if (txnError) {
            console.error('Error creating invoice:', txnError);
            throw txnError;
        }

        // Insert invoice items
        const itemsToInsert = items.map(item => ({
            transaction_id: txnData.id,
            product_id: item.productId,
            product_name: item.productName,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            cgst: item.cgst,
            sgst: item.sgst,
            igst: item.igst,
            cgst_amount: item.cgstAmount,
            sgst_amount: item.sgstAmount,
            igst_amount: item.igstAmount,
            discount: item.discount,
            discount_amount: item.discountAmount,
            total: item.total,
            gst_amount: item.gstAmount,
        }));

        await supabase.from('invoice_items').insert(itemsToInsert);

        // Update dealer balance
        const dealer = dealers.find(d => d.id === dealerId);
        if (dealer) {
            const newBalance = dealer.balance + totalAmount;
            await supabase
                .from('dealers')
                .update({
                    balance: newBalance,
                    last_transaction_date: invoiceDate.toISOString()
                })
                .eq('id', dealerId);

            setDealers(prev => prev.map(d =>
                d.id === dealerId ? { ...d, balance: newBalance, lastTransactionDate: invoiceDate } : d
            ));
        }

        // Update stock for each item
        for (const item of items) {
            await updateStock(item.productId, item.quantity);
        }

        // Update local state
        const newTxn = transformTransaction(txnData);
        newTxn.items = items;
        setTransactions(prev => [newTxn, ...prev]);
        setInvoiceCount(prev => prev + 1);

        return invoiceNumber;
    };

    const recordPayment = async (dealerId: string, amount: number, method: string, agentName?: string, reference?: string) => {
        const receiptNumber = reference || `R${String(receiptCount).padStart(3, '0')}`;
        const paymentDate = new Date();

        // FIFO: Get all unpaid/partially paid invoices for this dealer
        const dealerInvoices = transactions
            .filter(t => t.customerId === dealerId && t.type === TransactionType.INVOICE)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate current balances
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

        // Insert payment transaction
        const { data: txnData, error: txnError } = await supabase
            .from('transactions')
            .insert({
                customer_id: dealerId,
                type: 'PAYMENT',
                amount: amount,
                date: paymentDate.toISOString(),
                reference_id: receiptNumber,
                notes: `via ${method}`,
                agent_name: agentName || 'Admin',
                collection_date: paymentDate.toISOString(),
            })
            .select()
            .single();

        if (txnError) {
            console.error('Error recording payment:', txnError);
            throw txnError;
        }

        // Apply new payment using FIFO and insert allocations
        const paymentAllocations: PaymentAllocation[] = [];
        let remainingAmount = amount;

        for (const invoice of dealerInvoices) {
            if (remainingAmount <= 0) break;

            const invoiceBalance = invoiceBalances.get(invoice.id) || 0;
            if (invoiceBalance <= 0) continue;

            const amountToApply = Math.min(remainingAmount, invoiceBalance);

            // Insert allocation to Supabase
            await supabase.from('payment_allocations').insert({
                invoice_id: invoice.id,
                invoice_ref: invoice.referenceId || 'N/A',
                receipt_id: txnData.id,
                receipt_ref: receiptNumber,
                amount: amountToApply,
                date: paymentDate.toISOString(),
                agent_name: agentName || 'Admin',
            });

            paymentAllocations.push({
                invoiceId: invoice.id,
                invoiceRef: invoice.referenceId || 'N/A',
                receiptId: txnData.id,
                receiptRef: receiptNumber,
                amount: amountToApply,
                date: paymentDate,
                agentName: agentName || 'Admin'
            });

            remainingAmount -= amountToApply;
        }

        // Update dealer balance
        const dealer = dealers.find(d => d.id === dealerId);
        if (dealer) {
            const newBalance = dealer.balance - amount;
            await supabase
                .from('dealers')
                .update({
                    balance: newBalance,
                    last_transaction_date: paymentDate.toISOString()
                })
                .eq('id', dealerId);

            setDealers(prev => prev.map(d =>
                d.id === dealerId ? { ...d, balance: newBalance, lastTransactionDate: paymentDate } : d
            ));
        }

        // Update local state
        const newTxn = transformTransaction(txnData);
        newTxn.paymentAllocations = paymentAllocations;
        setTransactions(prev => [newTxn, ...prev]);
        if (!reference) {
            setReceiptCount(prev => prev + 1);
        }

        return receiptNumber;
    };

    // Agent CRUD methods
    const addAgent = async (agentData: Omit<Agent, 'id'>): Promise<string> => {
        const { data, error } = await supabase
            .from('agents')
            .insert({
                name: agentData.name,
                phone: agentData.phone,
                area: agentData.area,
                division: agentData.division,
                collection_target: agentData.collectionTarget || 100000,
                is_active: agentData.isActive ?? true,
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding agent:', error);
            throw error;
        }

        const newAgent = transformAgent(data);
        setAgents(prev => [newAgent, ...prev]);
        return newAgent.id;
    };

    const updateAgent = async (updatedAgent: Agent) => {
        const { error } = await supabase
            .from('agents')
            .update({
                name: updatedAgent.name,
                phone: updatedAgent.phone,
                area: updatedAgent.area,
                division: updatedAgent.division,
                collection_target: updatedAgent.collectionTarget,
                is_active: updatedAgent.isActive,
            })
            .eq('id', updatedAgent.id);

        if (error) {
            console.error('Error updating agent:', error);
            throw error;
        }

        setAgents(prev => prev.map(a => a.id === updatedAgent.id ? updatedAgent : a));
    };

    const deleteAgent = async (id: string) => {
        const { error } = await supabase
            .from('agents')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting agent:', error);
            throw error;
        }

        setAgents(prev => prev.filter(a => a.id !== id));
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
            isLoading,
            error,
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
            refreshData,
            addAgent,
            updateAgent,
            deleteAgent,
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
