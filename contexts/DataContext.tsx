'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Dealer, Product, Transaction, TransactionType, InvoiceItem, Agent, PaymentAllocation, AgentTrackingData } from '@/types';
import { supabase } from '@/lib/supabase';
import { getAllAgentTrackingData, subscribeToLocationUpdates, subscribeToStatusUpdates } from '@/lib/agentTrackingService';

interface InvoiceData {
    vehicleName?: string;
    vehicleNumber?: string;
    destination?: string;
    transportCharges?: number;
    paymentTerms?: string;
    discountPercent?: number;
    creditDays?: number;
    notes?: string;
    invoiceDate?: Date;
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
    // Tracking
    trackingData: AgentTrackingData[];
    loadingTracking: boolean;
    // Methods
    createInvoice: (dealerId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => Promise<string>;
    updateInvoice: (invoiceId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => Promise<void>;
    recordPayment: (dealerId: string, amount: number, method: string, agentName?: string, reference?: string) => Promise<string>;
    updateStock: (productId: string, quantity: number) => void;
    addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
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
    costPrice: Number(row.cost_price) || 0,
    stock: Number(row.stock),
    gstRate: Number(row.gst_rate),
    hsnCode: row.hsn_code,
    unit: row.unit || 'nos',
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
    items: row.invoice_items ? row.invoice_items.map(transformInvoiceItem) : [],
});

const transformInvoiceItem = (item: any): InvoiceItem => ({
    productId: item.product_id,
    productName: item.product_name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    cgst: item.cgst,
    sgst: item.sgst,
    igst: item.igst,
    cgstAmount: item.cgst_amount,
    sgstAmount: item.sgst_amount,
    igstAmount: item.igst_amount,
    discount: item.discount,
    discountAmount: item.discount_amount,
    total: item.total,
    hsnCode: item.hsn_code,
    unit: item.unit,
    gstRate: item.gst_rate // Note: createInvoice doesn't explicitly save gst_rate but it's derivable or maybe saved if I assume standard schema
});

const transformAgent = (row: any): Agent => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    area: row.area,
    division: row.division,
    collectionTarget: row.collection_target ? Number(row.collection_target) : undefined,
    monthlySalary: row.monthly_salary ? Number(row.monthly_salary) : undefined,
    isActive: row.is_active,
});

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [trackingData, setTrackingData] = useState<AgentTrackingData[]>([]);
    const [loadingTracking, setLoadingTracking] = useState(false);

    // Sequential counters
    const [invoiceCount, setInvoiceCount] = useState(1);
    const [receiptCount, setReceiptCount] = useState(1);
    const [productCount, setProductCount] = useState(1);

    // LocalStorage key for products
    const PRODUCTS_KEY = 'sve_products';

    // Helper functions for localStorage
    const getLocalProducts = (): Product[] => {
        if (typeof window === 'undefined') return [];
        const data = localStorage.getItem(PRODUCTS_KEY);
        return data ? JSON.parse(data) : [];
    };

    const saveLocalProducts = (data: Product[]) => {
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(data));
    };

    // Fetch all data - Products from localStorage, others from Supabase
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Fetch products from localStorage
            const localProducts = getLocalProducts();
            setProducts(localProducts);
            setProductCount(localProducts.length + 1);

            // Fetch dealers from Supabase
            const { data: dealersData, error: dealersError } = await supabase
                .from('dealers')
                .select('*')
                .order('business_name');

            if (dealersError) throw dealersError;

            // Fetch transactions from Supabase with items
            const { data: transactionsData, error: transactionsError } = await supabase
                .from('transactions')
                .select('*, invoice_items(*)')
                .order('date', { ascending: false });

            if (transactionsError) throw transactionsError;

            // Fetch agents from Supabase
            const { data: agentsData, error: agentsError } = await supabase
                .from('agents')
                .select('*')
                .order('name');

            if (agentsError) throw agentsError;

            // Transform and set data
            setDealers(dealersData?.map(transformDealer) || []);
            setTransactions(transactionsData?.map(transformTransaction) || []);
            setAgents(agentsData?.map(transformAgent) || []);

            // Calculate counts for numbering
            const invoices = transactionsData?.filter(t => t.type === 'INVOICE') || [];
            const payments = transactionsData?.filter(t => t.type === 'PAYMENT') || [];
            setInvoiceCount(invoices.length + 1);
            setReceiptCount(payments.length + 1);

        } catch (err: any) {
            console.error('Error fetching data:', err);
            setError(err.message || 'Failed to fetch data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refreshData = async () => {
        await fetchData();
        await loadTrackingData();
    };

    const loadTrackingData = useCallback(async () => {
        setLoadingTracking(true);
        try {
            const data = await getAllAgentTrackingData();
            setTrackingData(data);
        } catch (err) {
            console.error('Error loading tracking data:', err);
        } finally {
            setLoadingTracking(false);
        }
    }, []);

    // Initial data fetch and Subscriptions
    useEffect(() => {
        fetchData();
        loadTrackingData();

        // Listen for local storage product updates from purchase service
        const handleStorageUpdate = () => {
            fetchData();
        };
        window.addEventListener('storage_products_updated', handleStorageUpdate);

        // Subscribe to real-time tracking updates
        const statusSub = subscribeToStatusUpdates((status) => {
            setTrackingData(prev => prev.map(data =>
                data.agent.id === status.agentId
                    ? { ...data, status }
                    : data
            ));
        });

        const locationSub = subscribeToLocationUpdates((location) => {
            setTrackingData(prev => prev.map(data =>
                data.agent.id === location.agentId
                    ? { ...data, latestLocation: location }
                    : data
            ));
        });

        return () => {
            window.removeEventListener('storage_products_updated', handleStorageUpdate);
            statusSub.unsubscribe();
            locationSub.unsubscribe();
        };
    }, [fetchData, loadTrackingData]);

    const updateStock = (productId: string, quantity: number) => {
        const currentProducts = getLocalProducts();
        const updatedProducts = currentProducts.map(p => {
            if (p.id === productId || p.productId === productId) {
                return { ...p, stock: p.stock - quantity };
            }
            return p;
        });
        saveLocalProducts(updatedProducts);
        setProducts(updatedProducts);
    };

    const addProduct = async (productData: Omit<Product, 'id'>) => {
        const currentProducts = getLocalProducts();

        const newProduct: Product = {
            id: crypto.randomUUID(),
            ...productData,
            costPrice: Number(productData.costPrice) || 0
        };

        const updatedProducts = [newProduct, ...currentProducts];
        saveLocalProducts(updatedProducts);
        setProducts(updatedProducts);
        setProductCount(updatedProducts.length + 1);
    };

    const updateProduct = async (updatedProduct: Product) => {
        const currentProducts = getLocalProducts();
        const updatedProducts = currentProducts.map(p =>
            p.id === updatedProduct.id ? updatedProduct : p
        );
        saveLocalProducts(updatedProducts);
        setProducts(updatedProducts);
    };

    const deleteProduct = async (id: string) => {
        const currentProducts = getLocalProducts();
        const updatedProducts = currentProducts.filter(p => p.id !== id);
        saveLocalProducts(updatedProducts);
        setProducts(updatedProducts);
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
        const invoiceDate = invoiceData?.invoiceDate || new Date();

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
                notes: invoiceData?.notes,
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
            hsn_code: item.hsnCode,
            unit: item.unit,
        }));

        await supabase.from('invoice_items').insert(itemsToInsert);

        // Calculate tax totals
        const totalCGST = items.reduce((sum, item) => sum + item.cgstAmount, 0);
        const totalSGST = items.reduce((sum, item) => sum + item.sgstAmount, 0);
        const totalIGST = items.reduce((sum, item) => sum + item.igstAmount, 0);
        const totalTax = totalCGST + totalSGST + totalIGST;
        const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        const discountAmount = (subtotal * (invoiceData?.discountPercent || 0)) / 100;

        // Get dealer info
        const dealer = dealers.find(d => d.id === dealerId);

        // Insert into bill_payments table for mobile app to display invoice metadata
        // receipt_number is NULL until payment is made
        await supabase.from('bill_payments').insert({
            receipt_number: null,
            bill_number: invoiceNumber,
            amount_applied: 0, // No payment applied yet
            payment_date: invoiceDate.toISOString().split('T')[0], // Use invoice date as placeholder
            payment_mode: null, // No payment mode until payment is made
        });

        // Update dealer balance
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

    const updateInvoice = async (invoiceId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => {
        // 1. Get existing transaction to calculate balance diff and restore stock
        const existingTxn = transactions.find(t => t.id === invoiceId);
        if (!existingTxn) throw new Error("Invoice not found");

        const itemsResponse = await supabase
            .from('invoice_items')
            .select('*')
            .eq('transaction_id', invoiceId);

        const oldItems = itemsResponse.data || [];

        // 2. Restore Stock for OLD items
        for (const item of oldItems) {
            // updateStock subtracts, so passing negative quantity adds stock back
            await updateStock(item.product_id, -item.quantity);
        }

        // 3. Update Transaction Details
        const creditDays = invoiceData?.creditDays || existingTxn.creditDays || 30;
        // Keep original date if needed, or update? usually invoice date stays same, but details change.
        // Let's keep original date unless explicitly asked to change logic.
        const dueDate = new Date(existingTxn.date);
        dueDate.setDate(dueDate.getDate() + creditDays);

        const { error: updateError } = await supabase
            .from('transactions')
            .update({
                amount: totalAmount,
                credit_days: creditDays,
                due_date: dueDate.toISOString(),
                vehicle_name: invoiceData?.vehicleName,
                vehicle_number: invoiceData?.vehicleNumber,
                destination: invoiceData?.destination,
                transport_charges: invoiceData?.transportCharges,
                payment_terms: invoiceData?.paymentTerms,
                discount_percent: invoiceData?.discountPercent,
                notes: invoiceData?.notes,
            })
            .eq('id', invoiceId);

        if (updateError) throw updateError;

        // 4. Delete OLD invoice items
        await supabase
            .from('invoice_items')
            .delete()
            .eq('transaction_id', invoiceId);

        // 5. Insert NEW invoice items
        const itemsToInsert = items.map(item => ({
            transaction_id: invoiceId,
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
            hsn_code: item.hsnCode,
            unit: item.unit,
        }));

        await supabase.from('invoice_items').insert(itemsToInsert);

        // 6. Deduct Stock for NEW items
        for (const item of items) {
            await updateStock(item.productId, item.quantity);
        }

        // 7. Update Dealer Balance
        const dealer = dealers.find(d => d.id === existingTxn.customerId);
        if (dealer) {
            // Balance = OldBalance - OldInvoiceAmount + NewInvoiceAmount
            const balanceDiff = totalAmount - existingTxn.amount;
            const newBalance = dealer.balance + balanceDiff;

            await supabase
                .from('dealers')
                .update({ balance: newBalance })
                .eq('id', dealer.id);

            setDealers(prev => prev.map(d =>
                d.id === dealer.id ? { ...d, balance: newBalance } : d
            ));
        }

        // 8. Update local state
        setTransactions(prev => prev.map(t => {
            if (t.id === invoiceId) {
                return {
                    ...t,
                    amount: totalAmount,
                    creditDays: creditDays,
                    dueDate: dueDate,
                    vehicleName: invoiceData?.vehicleName,
                    vehicleNumber: invoiceData?.vehicleNumber,
                    destination: invoiceData?.destination,
                    transportCharges: invoiceData?.transportCharges,
                    paymentTerms: invoiceData?.paymentTerms,
                    discountPercent: invoiceData?.discountPercent,
                    items: items
                };
            }
            return t;
        }));
    };

    const recordPayment = async (dealerId: string, amount: number, method: string, agentName?: string, reference?: string) => {
        const paymentDate = new Date();

        // Use the atomic RPC function for consistent FIFO allocation across all apps
        // This handles: Transaction creation, FIFO allocations, and Dealer balance update
        const { data: rpcData, error: rpcError } = await supabase.rpc('record_payment_fifo', {
            p_customer_id: dealerId,
            p_amount: amount,
            p_payment_mode: method,
            p_agent_name: agentName || 'Admin',
            p_notes: `via ${method}`
        });

        if (rpcError) {
            console.error('Error recording payment via RPC:', rpcError);
            throw rpcError;
        }

        const receiptNumber = rpcData.receipt_ref;

        // Fetch the newly created transaction to update local state
        const { data: txnRow, error: fetchError } = await supabase
            .from('transactions')
            .select('*, payment_allocations(*)')
            .eq('id', rpcData.receipt_id)
            .single();

        if (fetchError) {
            console.error('Error fetching created transaction:', fetchError);
            // Even if fetch fails, the DB is updated, so we should refresh
            await fetchData();
            return receiptNumber;
        }

        // Update local dealer balance
        setDealers(prev => prev.map(d => {
            if (d.id === dealerId) {
                return {
                    ...d,
                    balance: d.balance - amount,
                    lastTransactionDate: paymentDate
                };
            }
            return d;
        }));

        // Update local transactions state
        const newTxn = transformTransaction(txnRow);
        newTxn.paymentAllocations = txnRow.payment_allocations;
        setTransactions(prev => [newTxn, ...prev]);

        if (!reference) {
            setReceiptCount(prev => prev + 1);
        }

        return receiptNumber;
    };

    const transformAgent = (row: any): Agent => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        area: row.area,
        division: row.division,
        collectionTarget: row.collection_target ? Number(row.collection_target) : undefined,
        monthlySalary: row.monthly_salary ? Number(row.monthly_salary) : undefined,
        isActive: row.is_active,
        agentId: row.agent_id,
    });

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
                monthly_salary: agentData.monthlySalary || 0,
                is_active: agentData.isActive ?? true,
                agent_id: agentData.agentId,
                password: agentData.password,
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding agent:', error);
            console.error('Error details:', JSON.stringify(error, null, 2)); // improved logging
            throw error;
        }

        const newAgent = transformAgent(data);
        setAgents(prev => [newAgent, ...prev]);
        return newAgent.id;
    };

    const updateAgent = async (updatedAgent: Agent) => {
        const updateData: any = {
            name: updatedAgent.name,
            phone: updatedAgent.phone,
            area: updatedAgent.area,
            division: updatedAgent.division,
            collection_target: updatedAgent.collectionTarget,
            monthly_salary: updatedAgent.monthlySalary || 0,
            is_active: updatedAgent.isActive,
            agent_id: updatedAgent.agentId,
        };

        // Only include password if it's being changed (non-empty string)
        if (updatedAgent.password) {
            updateData.password = updatedAgent.password;
        }

        const { error } = await supabase
            .from('agents')
            .update(updateData)
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
            updateInvoice,
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
            getCustomerTransactions,
            trackingData,
            loadingTracking
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
