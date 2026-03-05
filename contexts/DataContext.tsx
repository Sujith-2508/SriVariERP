'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Dealer, Product, Transaction, TransactionType, InvoiceItem, Agent, PaymentAllocation, AgentTrackingData, CompanySettings } from '@/types';
import { supabase } from '@/lib/supabase';
import { getAllAgentTrackingData, subscribeToLocationUpdates, subscribeToStatusUpdates, subscribeToTransactionUpdates } from '@/lib/agentTrackingService';
import { fetchProductsFromSheet, getLocalProducts, saveLocalProducts } from '@/lib/googleSheetProducts';
import { addProductToSheet, updateProductInSheet, deleteProductFromSheet, readProductsFromSheet } from '@/lib/googleSheetWriter';
import { syncDealerToSheet, removeDealerFromSheet, bulkSyncDealersToSheet, fetchRefinedDealersRaw, parseTallyLedgers, deleteDealerSheet, syncTransactionToDealerSheet, clearDealerTransactionsForSync, findTransactionRow, bulkCreateDealerTabs, initializeDealerLedger, batchWriteTransactionsToDealerSheet } from '@/lib/googleSheetDealers';

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
    createInvoice: (dealerId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => Promise<{ id: string, refId: string }>;
    updateInvoice: (invoiceId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => Promise<void>;
    recordPayment: (dealerId: string, amount: number, method: string, agentName?: string, reference?: string) => Promise<string>;
    updateStock: (productId: string, quantity: number) => Promise<void>;
    addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
    updateProduct: (product: Product) => Promise<void>;
    deleteProduct: (id: string) => Promise<void>;
    addDealer: (dealer: Omit<Dealer, 'id'>) => Promise<string>;
    updateDealer: (dealer: Dealer) => Promise<void>;
    deleteDealer: (id: string) => Promise<void>;
    getDealerTransactions: (dealerId: string) => Transaction[];
    getInvoicePaymentHistory: (invoiceId: string) => PaymentAllocation[];
    refreshData: () => Promise<void>;
    bulkSyncDealers: () => Promise<void>;
    syncAllDealerTabs: () => Promise<{ created: number; skipped: number }>;
    importDealersFromSheet: () => Promise<{ added: number; updated: number }>;
    importDealersFromTally: () => Promise<{ added: number; updated: number }>;
    deleteDealerWithSheet: (id: string, sheetName: string, deleteTab: boolean) => Promise<void>;
    syncDealerLedgerToSheet: (dealerId: string) => Promise<void>;
    bulkSyncAllDealerLedgers: (onProgress?: (done: number, total: number, name: string) => void) => Promise<{ synced: number; errors: number }>;
    // Agent methods
    addAgent: (agent: Omit<Agent, 'id'>) => Promise<string>;
    updateAgent: (agent: Agent) => Promise<void>;
    deleteAgent: (id: string) => Promise<void>;
    // Backward compatible aliases
    customers: Dealer[];
    addCustomer: (customer: Omit<Dealer, 'id'>) => Promise<string>;
    deleteCustomer: (id: string) => Promise<void>;
    getCustomerTransactions: (customerId: string) => Transaction[];
    companySettings: CompanySettings | null;
    lastBackgroundSync: Date | null;
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

const transformTransaction = (row: any, allAllocations: PaymentAllocation[] = []): Transaction => {
    const transactionId = row.id;
    const type = row.type as TransactionType;

    // For Invoices: show what payments were applied TO this invoice
    // For Payments: show what invoices were reduced BY this payment
    const allocations = allAllocations.filter(a =>
        type === TransactionType.INVOICE ? a.invoiceId === transactionId : a.receiptId === transactionId
    );

    return {
        id: row.id,
        customerId: row.customer_id,
        type: type,
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
        paymentTerms: row.payment_terms,
        discountPercent: row.discount_percent ? Number(row.discount_percent) : undefined,
        items: row.invoice_items && row.invoice_items.length > 0
            ? row.invoice_items.map(transformInvoiceItem)
            : (() => {
                // Fallback: parse items from notes JSON
                try {
                    if (row.notes) {
                        const notes = JSON.parse(row.notes);
                        if (notes.invoiceItems && Array.isArray(notes.invoiceItems)) {
                            return notes.invoiceItems as InvoiceItem[];
                        }
                    }
                } catch (e) { /* ignore parse errors */ }
                return [];
            })(),
        paymentAllocations: allocations,
        // Profit Analysis fields from DB
        cogs: Number(row.cogs) || 0,
        transportCharges: row.transport_charges ? Number(row.transport_charges) : 0,
        profitAmount: Number(row.profit_amount) || 0,
        profitPercentage: Number(row.profit_percentage) || 0,
    };
};

const transformAllocation = (row: any): PaymentAllocation => ({
    invoiceId: row.invoice_id,
    invoiceRef: row.invoice_ref,
    receiptId: row.receipt_id,
    receiptRef: row.receipt_ref,
    amount: Number(row.amount),
    date: new Date(row.date),
    agentName: row.agent_name,
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
    agentId: row.agent_id,
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
    const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);

    // Sequential counters
    const [invoiceCount, setInvoiceCount] = useState(1);
    const [receiptCount, setReceiptCount] = useState(1);
    const [productCount, setProductCount] = useState(1);

    // REFs to prevent stale closures in background tasks/intervals
    const dealersRef = useRef<Dealer[]>([]);
    const transactionsRef = useRef<Transaction[]>([]);
    const isLoadingRef = useRef(true);

    // Sync REFs with state
    useEffect(() => {
        dealersRef.current = dealers;
    }, [dealers]);

    useEffect(() => {
        transactionsRef.current = transactions;
    }, [transactions]);

    useEffect(() => {
        isLoadingRef.current = isLoading;
    }, [isLoading]);

    // Fetch all data - Products from Google Sheet, others from Supabase
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Fetch products from Google Sheet via API (primary)
            try {
                const { products: sheetProducts } = await readProductsFromSheet();
                if (sheetProducts.length > 0) {
                    setProducts(sheetProducts);
                    setProductCount(sheetProducts.length + 1);
                    console.log('[DataContext] Loaded', sheetProducts.length, 'products from Google Sheet');
                    saveLocalProducts(sheetProducts); // Cache for offline fallback
                } else {
                    // Empty sheet or tally format fallback
                    const localProducts = getLocalProducts();
                    setProducts(localProducts);
                    setProductCount(localProducts.length + 1);
                }
            } catch (sheetErr) {
                console.warn('[DataContext] authenticated Sheet fetch failed, trying CSV fallback:', sheetErr);
                // Fallback to CSV URL (if configured) or localStorage
                const sheetUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEET_CSV_URL;
                if (sheetUrl) {
                    try {
                        const csvProducts = await fetchProductsFromSheet(sheetUrl);
                        setProducts(csvProducts);
                        setProductCount(csvProducts.length + 1);
                        console.log('[DataContext] Loaded', csvProducts.length, 'products from CSV fallback');
                    } catch (csvErr) {
                        const localProducts = getLocalProducts();
                        setProducts(localProducts);
                        setProductCount(localProducts.length + 1);
                    }
                } else {
                    const localProducts = getLocalProducts();
                    setProducts(localProducts);
                    setProductCount(localProducts.length + 1);
                }
            }

            // Fetch company settings
            const { data: companyData } = await supabase.from('company_settings').select('*').single();
            if (companyData) {
                setCompanySettings({
                    id: companyData.id,
                    companyName: companyData.company_name,
                    addressLine1: companyData.address_line1,
                    addressLine2: companyData.address_line2,
                    city: companyData.city,
                    state: companyData.state,
                    pinCode: companyData.pin_code,
                    gstNumber: companyData.gst_number,
                    panNumber: companyData.pan_number,
                    phone: companyData.phone,
                    email: companyData.email,
                    bankName: companyData.bank_name,
                    bankBranch: companyData.bank_branch,
                    accountNumber: companyData.account_number,
                    ifscCode: companyData.ifsc_code,
                    accountHolderName: companyData.account_holder_name
                });
            }

            // Fetch dealers from Supabase
            const { data: dealersData, error: dealersError } = await supabase
                .from('dealers')
                .select('*')
                .order('business_name');

            if (dealersError) {
                console.error('[DataContext] Error fetching dealers:', dealersError);
                throw dealersError;
            }

            // Fetch transactions and items in parallel but separately to avoid join hangs
            const [transactionsResult, itemsResult] = await Promise.all([
                supabase.from('transactions').select('*').order('date', { ascending: false }),
                supabase.from('invoice_items').select('*')
            ]);

            const { data: transactionsData, error: transactionsError } = transactionsResult;
            const { data: itemsData, error: itemsError } = itemsResult;

            if (transactionsError) {
                console.error('[DataContext] Error fetching transactions:', transactionsError);
                throw transactionsError;
            }
            if (itemsError) {
                console.error('[DataContext] Error fetching invoice items:', itemsError);
                // We can continue if only items fail, but let's log it
            }

            console.log('[DataContext] Fetched transactions:', transactionsData?.length);
            console.log('[DataContext] Fetched items:', itemsData?.length);

            // Fetch payment allocations separately
            const { data: allocationsData, error: allocationsError } = await supabase
                .from('payment_allocations')
                .select('*');

            if (allocationsError) {
                console.error('[DataContext] Error fetching allocations:', allocationsError);
                throw allocationsError;
            }

            const transformedAllocations = allocationsData?.map(transformAllocation) || [];

            // Map items to transactions in JS (more reliable than SQL join for small datasets)
            const transactionsWithItems = (transactionsData || []).map(row => {
                const items = (itemsData || []).filter(item => item.transaction_id === row.id);
                return { ...row, invoice_items: items };
            });

            // Fetch agents from Supabase
            const { data: agentsData, error: agentsError } = await supabase
                .from('agents')
                .select('*')
                .order('name');

            if (agentsError) {
                console.error('[DataContext] Error fetching agents:', agentsError);
                throw agentsError;
            }

            // Transform and set data
            setDealers(dealersData?.map(transformDealer) || []);
            setTransactions(transactionsWithItems.map(row => transformTransaction(row, transformedAllocations)));

            // Filter out deleted agents (those with "(Deleted)" in name or "del_" in ID/phone)
            const allAgents = agentsData?.map(transformAgent) || [];
            const filteredAgents = allAgents.filter(a => {
                const isDeletedName = a.name?.includes('(Deleted)');
                const isDeletedId = a.agentId?.startsWith('del_');
                const isDeletedPhone = a.phone?.startsWith('del_');
                return !isDeletedName && !isDeletedId && !isDeletedPhone;
            });
            setAgents(filteredAgents);

            // Initialize trackingData placeholder with agents to avoid empty state for real-time updates
            setTrackingData(prev => {
                const existingDataMap = new Map(prev.map(d => [d.agent.id, d]));
                return filteredAgents.map(agent => ({
                    agent: agent,
                    ...(existingDataMap.get(agent.id) || {})
                }));
            });

            // Calculate counts for numbering
            const invoices = transactionsData?.filter(t => t.type === 'INVOICE') || [];
            const payments = transactionsData?.filter(t => t.type === 'PAYMENT') || [];
            setInvoiceCount(invoices.length + 1);
            setReceiptCount(payments.length + 1);

        } catch (err: any) {
            console.error('Error fetching data (full details):', {
                message: err?.message || 'No message',
                details: err?.details || 'No details',
                hint: err?.hint || 'No hint',
                code: err?.code || 'No code',
                stack: err?.stack || 'No stack'
            });
            setError(err?.message || 'Failed to fetch data');
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
            setTrackingData(prev => {
                // If we already have some data from real-time while this was fetching,
                // we should merge or at least be careful.
                // For simplicity, we just use the fresh fetch but we could do more.
                return data;
            });
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
            console.log('[DataContext] Real-time status update:', {
                agentId: status.agentId,
                isActive: status.isActive,
                lastActive: status.lastActiveAt,
                address: status.currentAddress
            });
            setTrackingData(prev => prev.map(data =>
                (data.agent.id === status.agentId || data.agent.agentId === status.agentId)
                    ? { ...data, status }
                    : data
            ));
        });

        const locationSub = subscribeToLocationUpdates((location) => {
            console.log('[DataContext] Real-time location update:', {
                agentId: location.agentId,
                lat: location.latitude,
                lng: location.longitude,
                timestamp: location.recordedAt
            });
            setTrackingData(prev => {
                const updated = prev.map(data =>
                    (data.agent.id === location.agentId || data.agent.agentId === location.agentId)
                        ? { ...data, latestLocation: location }
                        : data
                );
                // If the agent wasn't found in current trackingData, it might be a newly added agent
                // but we should already have a placeholder from setAgents
                return updated;
            });
        });

        // NEW: Subscribe to transactions to sync mobile receipts in real-time
        const transactionSub = subscribeToTransactionUpdates(async (data: any, event: 'INSERT' | 'UPDATE' | 'DELETE') => {
            const isMobile = data.source?.toUpperCase() === 'MOBILE';
            if (event === 'INSERT' && isMobile) {
                console.log('[DataContext] REAL-TIME: New mobile transaction detected:', data.reference_id);

                // 1. Check if we already have this in state to avoid duplicate UI/sync
                // Use Ref to avoid stale closure issues
                if (transactionsRef.current.some(t => t.id === data.id)) {
                    console.log('[DataContext] REAL-TIME: Transaction already exists in state, skipping');
                    return;
                }

                setTransactions(prev => [transformTransaction(data), ...prev]);

                // 2. Fetch dealer to get updated balance and sync to sheet
                try {
                    const { data: dealerData } = await supabase
                        .from('dealers')
                        .select('*')
                        .eq('id', data.customer_id)
                        .single();

                    if (dealerData) {
                        const dealer = transformDealer(dealerData);
                        setDealers(prev => prev.map(d => d.id === dealer.id ? dealer : d));

                        // 3. Sync to Google Sheet
                        console.log('[DataContext] REAL-TIME syncing mobile payment to Sheet:', data.reference_id);
                        const transformedTxn = transformTransaction(data);
                        syncTransactionToDealerSheet(dealer.businessName, transformedTxn, dealer.balance).catch(e =>
                            console.warn('[DataContext] Real-time sheet sync failed:', e)
                        );
                    }
                } catch (e) {
                    console.error('[DataContext] Error handling real-time transaction sync:', e);
                }
            }
        });

        // NEW: Handle window focus to catch any transactions missed while the app was backgrounded/paused
        const handleFocus = () => {
            console.log('[DataContext] Window focused: Refreshing for latest mobile syncs');
            refreshData();
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            window.removeEventListener('storage_products_updated', handleStorageUpdate);
            window.removeEventListener('focus', handleFocus);
            statusSub.unsubscribe();
            locationSub.unsubscribe();
            transactionSub.unsubscribe();
        };
    }, []); // Removed fetchData/loadTrackingData from deps to prevent infinite loops if they change

    const updateStock = async (productId: string, quantity: number) => {
        const currentProducts = getLocalProducts();
        let updatedProduct: (Product & { rowIndex?: number }) | null = null;
        const updatedProducts = currentProducts.map(p => {
            if (p.id === productId || p.productId === productId) {
                const newStock = p.stock - quantity;
                updatedProduct = { ...p, stock: newStock };
                return updatedProduct;
            }
            return p;
        });
        saveLocalProducts(updatedProducts);
        setProducts(updatedProducts);

        // Sync updated stock to Google Sheet in background
        if (updatedProduct) {
            const prod = updatedProduct as Product & { rowIndex?: number };
            updateProductInSheet(prod.rowIndex || 0, prod).catch(e =>
                console.warn('[DataContext] Stock sync to Google Sheet failed (non-critical):', e)
            );
        }
    };

    const addProduct = async (productData: Omit<Product, 'id'>) => {
        const newProduct: Product = {
            ...productData,
            id: `P${String(productCount).padStart(3, '0')}`,
        };

        // Update local state immediately for snappy UX
        const updatedProducts = [newProduct, ...products];
        setProducts(updatedProducts);
        setProductCount(prev => prev + 1);
        saveLocalProducts(updatedProducts);

        // Sync to Google Sheet, then re-read to get authoritative data (with rowIndex)
        try {
            await addProductToSheet(newProduct);
            const { products: sheetProducts } = await readProductsFromSheet();
            if (sheetProducts.length > 0) {
                setProducts(sheetProducts);
                setProductCount(sheetProducts.length + 1);
                saveLocalProducts(sheetProducts);
            }
        } catch (e) {
            console.warn('[DataContext] Could not sync product add to Google Sheet:', e);
        }
    };

    const updateProduct = async (updatedProduct: Product) => {
        if (!updatedProduct.id) {
            console.error('[DataContext] Cannot update product: Missing ID');
            return;
        }

        // Update local state immediately for snappy UX
        const updatedProducts = products.map(p => p.id === updatedProduct.id ? updatedProduct : p);
        setProducts(updatedProducts);
        saveLocalProducts(updatedProducts);

        // Sync to Google Sheet (search by name if rowIndex missing), then re-read
        try {
            const productIndex = products.findIndex(p => p.id === updatedProduct.id);
            const rowIndex = (updatedProduct as any).rowIndex || (productIndex >= 0 ? productIndex + 2 : 0);
            await updateProductInSheet(rowIndex, updatedProduct);
            const { products: sheetProducts } = await readProductsFromSheet();
            if (sheetProducts.length > 0) {
                setProducts(sheetProducts);
                saveLocalProducts(sheetProducts);
            }
        } catch (e) {
            console.warn('[DataContext] Could not sync product update to Google Sheet:', e);
        }
    };

    const deleteProduct = async (id: string) => {
        // Find product and its row index before removing
        const product = products.find(p => p.id === id);
        const productIndex = products.findIndex(p => p.id === id);

        // Update local state immediately for snappy UX
        const updatedProducts = products.filter(p => p.id !== id);
        setProducts(updatedProducts);
        saveLocalProducts(updatedProducts);

        // Sync deletion to Google Sheet (physically removes the row), then re-read
        try {
            const rowIndex = (product as any)?.rowIndex || (productIndex >= 0 ? productIndex + 2 : 0);
            if (rowIndex > 0 || product?.name) {
                await deleteProductFromSheet(rowIndex, product?.name);
            }
            const { products: sheetProducts } = await readProductsFromSheet();
            if (sheetProducts.length > 0) {
                setProducts(sheetProducts);
                setProductCount(sheetProducts.length + 1);
                saveLocalProducts(sheetProducts);
            }
        } catch (e) {
            console.warn('[DataContext] Could not sync product delete to Google Sheet:', e);
        }
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

        // Sync to Google Sheets in background
        syncDealerToSheet(newDealer, companySettings).catch(e =>
            console.warn('[DataContext] Dealer sync to Google Sheet failed:', e)
        );

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

        // Sync to Google Sheets in background
        syncDealerToSheet(updatedDealer, companySettings).catch(e =>
            console.warn('[DataContext] Dealer update sync to Google Sheet failed:', e)
        );
    };

    const deleteDealer = async (id: string) => {
        // First delete related transactions
        await supabase
            .from('transactions')
            .delete()
            .eq('customer_id', id);

        // Get dealer object first to pull the name for Sheet tab deletion
        const dealerToDelete = dealers.find(d => d.id === id);

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

        // Remove from Google Sheets in background including the ledger tab
        if (dealerToDelete) {
            removeDealerFromSheet(id, dealerToDelete.businessName).catch(e =>
                console.warn('[DataContext] Dealer removal sync to Google Sheet failed:', e)
            );
        }
    };

    const getDealerTransactions = (dealerId: string, customTxns?: Transaction[]): Transaction[] => {
        const txnsToUse = customTxns || transactions;
        return txnsToUse
            .filter(t => t.customerId === dealerId)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };

    const getInvoicePaymentHistory = (invoiceId: string): PaymentAllocation[] => {
        const invoice = transactions.find(t => t.id === invoiceId);
        return invoice?.paymentAllocations || [];
    };

    const createInvoice = async (dealerId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => {
        const invoiceNumber = `INV${String(invoiceCount).padStart(3, '0')}`;
        const invoiceDate = invoiceData?.invoiceDate || new Date();

        const creditDays = invoiceData?.creditDays || 30;
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + creditDays);

        // Calculate COGS and Profit metrics for the invoice
        // Cheque returns are balance reversals — treat as 0 profit
        const noteStr = invoiceData?.notes || '';
        const isChequeReturn = noteStr.startsWith('Cheque Return') || noteStr.startsWith('Chq Return') || noteStr.startsWith('Check Return');

        const transportCharges = invoiceData?.transportCharges || 0;
        const discountPercent = invoiceData?.discountPercent || 0;

        let totalCOGS = 0;
        let netProfit = 0;
        let profitPercentage = 0;
        let dealerDiscountAmount = 0;

        if (!isChequeReturn) {
            items.forEach(item => {
                const product = products.find(p => p.id === item.productId || p.productId === item.productId);
                const costPrice = Number(product?.costPrice) || 0;
                totalCOGS += (costPrice * item.quantity);
            });

            const grossProfit = totalAmount - totalCOGS;
            dealerDiscountAmount = (grossProfit * discountPercent) / 100;
            netProfit = grossProfit - dealerDiscountAmount;
            profitPercentage = totalAmount > 0 ? (netProfit / totalAmount) * 100 : 0;
        }

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
                transport_charges: invoiceData?.transportCharges || 0,
                payment_terms: invoiceData?.paymentTerms,
                discount_percent: invoiceData?.discountPercent || 0,
                notes: invoiceData?.notes,
                // Persist calculation results
                cogs: totalCOGS,
                profit_amount: netProfit,
                profit_percentage: profitPercentage,
                dealer_discount_amount: dealerDiscountAmount,
                source: 'DESKTOP',
                synced_to_sheet: true // Mark as synced for desktop actions
            })
            .select()
            .single();

        if (txnError) {
            console.error('[DataContext] Error creating invoice:', txnError.message, txnError.details);
            throw new Error(`Failed to create invoice: ${txnError.message}`);
        }

        // Invoice items are now stored in the notes JSON field (no separate table insert needed)
        // Items are included in invoiceData.notes by the billing page
        console.log('[DataContext] Invoice items stored in notes JSON:', items.length, 'items');

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
        // Wrapped in try-catch as this is non-critical and may fail due to FK constraints
        try {
            const { error: billPayError } = await supabase.from('bill_payments').insert({
                receipt_number: null,
                bill_number: invoiceNumber,
                amount_applied: 0, // No payment applied yet
                payment_date: invoiceDate.toISOString().split('T')[0], // Use invoice date as placeholder
                payment_mode: null, // No payment mode until payment is made
            });
            if (billPayError) console.warn('[DataContext] bill_payment metadata insert skipped (non-critical):', billPayError.message);
        } catch (e) {
            console.warn('[DataContext] bill_payment metadata insert failed (non-critical):', e);
        }

        // Update dealer balance
        if (dealer) {
            const newBalance = dealer.balance + totalAmount;
            const { error: dealerUpdateError } = await supabase
                .from('dealers')
                .update({
                    balance: newBalance,
                    last_transaction_date: invoiceDate.toISOString()
                })
                .eq('id', dealerId);

            if (dealerUpdateError) console.error('[DataContext] Error updating dealer balance:', dealerUpdateError.message);

            setDealers(prev => prev.map(d =>
                d.id === dealerId ? { ...d, balance: newBalance, lastTransactionDate: invoiceDate } : d
            ));
        }

        // Update stock for each item
        for (const item of items) {
            try {
                await updateStock(item.productId, item.quantity);
            } catch (err) {
                console.error(`[DataContext] Failed to update stock for ${item.productName}:`, err);
            }
        }

        // Update local state
        const newTxn = transformTransaction(txnData);
        newTxn.items = items;
        setTransactions(prev => [newTxn, ...prev]);
        setInvoiceCount(prev => prev + 1);

        // Sync to individual dealer sheet with CORRECT running balance
        // Compute: sum of all dealer transactions (sorted by date) including the new one
        if (dealer) {
            const allDealerTxns = [...transactions, newTxn]
                .filter(t => t.customerId === dealerId)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            let runningBal = 0;
            for (const t of allDealerTxns) {
                if (t.type === 'INVOICE') runningBal += t.amount;
                else runningBal -= t.amount;
            }
            syncTransactionToDealerSheet(dealer.businessName, newTxn, runningBal).catch(e =>
                console.warn('[DataContext] Failed to sync invoice to dealer sheet:', e)
            );
        }

        return { id: txnData.id, refId: invoiceNumber };
    };

    const updateInvoice = async (invoiceId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: InvoiceData) => {
        // 1. Get existing transaction to calculate balance diff and restore stock
        const existingTxn = transactions.find(t => t.id === invoiceId);
        if (!existingTxn) throw new Error("Invoice not found");

        // Get old items from notes JSON or context for stock restoration
        let oldItems: InvoiceItem[] = existingTxn.items || [];
        if (oldItems.length === 0 && existingTxn.notes) {
            try {
                const oldNotes = JSON.parse(existingTxn.notes);
                if (oldNotes.invoiceItems) {
                    oldItems = oldNotes.invoiceItems;
                }
            } catch (e) {
                console.warn('[DataContext] Could not parse old items from notes');
            }
        }

        // 2. Restore Stock for OLD items
        for (const item of oldItems) {
            // updateStock subtracts, so passing negative quantity adds stock back
            await updateStock(item.productId, -item.quantity);
        }

        // 3. Update Transaction Details
        const creditDays = invoiceData?.creditDays || existingTxn.creditDays || 30;
        const dueDate = new Date(existingTxn.date);
        dueDate.setDate(dueDate.getDate() + creditDays);

        // Recalculate COGS and Profit metrics for the updated invoice
        let totalCOGS = 0;
        items.forEach(item => {
            const product = products.find(p => p.id === item.productId || p.productId === item.productId);
            const costPrice = Number(product?.costPrice) || 0;
            totalCOGS += (costPrice * item.quantity);
        });

        const transportCharges = invoiceData?.transportCharges || 0;
        const grossProfit = totalAmount - totalCOGS;
        const discountPercent = invoiceData?.discountPercent || 0;
        const dealerDiscountAmount = (grossProfit * discountPercent) / 100;
        const netProfit = grossProfit - dealerDiscountAmount;
        const profitPercentage = totalAmount > 0 ? (netProfit / totalAmount) * 100 : 0;

        const { error: updateError } = await supabase
            .from('transactions')
            .update({
                amount: totalAmount,
                credit_days: creditDays,
                due_date: dueDate.toISOString(),
                vehicle_name: invoiceData?.vehicleName,
                vehicle_number: invoiceData?.vehicleNumber,
                destination: invoiceData?.destination,
                transport_charges: transportCharges,
                payment_terms: invoiceData?.paymentTerms,
                discount_percent: discountPercent,
                notes: invoiceData?.notes,
                cogs: totalCOGS,
                profit_amount: netProfit,
                profit_percentage: profitPercentage,
                dealer_discount_amount: dealerDiscountAmount,
            })
            .eq('id', invoiceId);

        if (updateError) {
            console.error('[DataContext] Error updating invoice transaction:', updateError.message);
            throw new Error(`Failed to update invoice: ${updateError.message}`);
        }

        // Invoice items are now stored in the notes JSON field (no separate table operations needed)
        console.log('[DataContext] Invoice items stored in notes JSON during update:', items.length, 'items');

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
            p_notes: `via ${method}`,
            p_source: 'DESKTOP'
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

        // Sync to individual dealer sheet with CORRECT running balance
        const dealer = dealers.find(d => d.id === dealerId);
        if (dealer) {
            const allDealerTxns = [...transactions, newTxn]
                .filter(t => t.customerId === dealerId)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            let runningBal = 0;
            for (const t of allDealerTxns) {
                if (t.type === 'INVOICE') runningBal += t.amount;
                else runningBal -= t.amount;
            }
            syncTransactionToDealerSheet(dealer.businessName, newTxn, runningBal).catch(e =>
                console.warn('[DataContext] Failed to sync payment to dealer sheet:', e)
            );
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

        // Also add to tracking data so they appear in Live Map immediately
        setTrackingData(prev => [
            { agent: newAgent },
            ...prev
        ]);

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
        // 1. Get the agent details first content
        const agentToDelete = agents.find(a => a.id === id);
        if (!agentToDelete) {
            console.error('Agent not found locally');
            return;
        }

        // 2. "Soft Delete" the agent: Deactivate and rename to free up credentials
        // We append a timestamp to ensure uniqueness if they delete multiple people with same name/phone
        const timestamp = new Date().getTime().toString().slice(-6);
        const newName = `${agentToDelete.name} (Deleted)`;
        const newPhone = agentToDelete.phone.startsWith('del_') ? agentToDelete.phone : `del_${timestamp}_${agentToDelete.phone}`;
        const newAgentId = (agentToDelete.agentId && !agentToDelete.agentId.startsWith('del_'))
            ? `del_${timestamp}_${agentToDelete.agentId}`
            : agentToDelete.agentId;

        const { error: updateError } = await supabase
            .from('agents')
            .update({
                name: newName,
                is_active: false,
                phone: newPhone,
                agent_id: newAgentId,
                // We keep the division/area for historical reference
            })
            .eq('id', id);

        if (updateError) {
            console.error('Error soft-deleting agent:', updateError);
            throw updateError;
        }

        // 3. "Hard Delete" tracking data (Locations and Status) - As requested for privacy/cleanup
        // We do this in parallel to save time
        const [delLoc, delStatus] = await Promise.all([
            supabase.from('agent_locations').delete().eq('agent_id', id),
            supabase.from('agent_status').delete().eq('agent_id', id)
        ]);

        if (delLoc.error) console.error('Error deleting locations:', delLoc.error);
        if (delStatus.error) console.error('Error deleting status:', delStatus.error);

        // 4. Update local state
        // We filter them out entirely so they disappear from all UI lists
        setAgents(prev => prev.filter(a => a.id !== id));

        // Also remove from tracking data so they disappear from map immediately
        setTrackingData(prev => prev.filter(t => t.agent.id !== id));
    };

    // Backward compatible aliases
    const customers = dealers;
    const addCustomer = addDealer;
    const deleteCustomer = deleteDealer;
    const getCustomerTransactions = getDealerTransactions;

    const bulkSyncDealers = async () => {
        // Ensure we have the absolute latest data from DB before syncing to Sheet
        await fetchData();

        // Re-fetch dealers raw to ensure we get the absolute latest if state is slightly behind
        const { data: res, error: dealersError } = await supabase.from('dealers').select('*');
        if (dealersError || !res || res.length === 0) return;

        const currentDealers = res.map(transformDealer);
        console.log(`[DataContext] Starting Force Re-Sync for ${currentDealers.length} dealers to Google Sheets...`);

        // 1. Re-sync Master Index (Refined Dealers list) first
        await bulkSyncDealersToSheet(currentDealers);

        // 2. Comprehensive Ledger Sync (one-by-one to avoid rate limits)
        for (const dealer of currentDealers) {
            try {
                // syncDealerLedgerToSheet handles clearing the tab and re-appending all txns
                await syncDealerLedgerToSheet(dealer.id);

                // Mark all transactions for this dealer as synced in Supabase
                await supabase
                    .from('transactions')
                    .update({ synced_to_sheet: true })
                    .eq('customer_id', dealer.id);

                // Mark dealer as synced
                await supabase
                    .from('dealers')
                    .update({ synced_to_sheet: true })
                    .eq('id', dealer.id);
            } catch (err) {
                console.error(`[DataContext] Bulk re-sync failed for ${dealer.businessName}:`, err);
            }
        }

        await fetchData(); // Final refresh
    };

    const syncAllDealerTabs = async (): Promise<{ created: number; skipped: number }> => {
        if (dealers.length === 0) return { created: 0, skipped: 0 };
        return await bulkCreateDealerTabs(dealers, companySettings);
    };

    const importDealersFromSheet = async () => {
        const sheetDealers = await fetchRefinedDealersRaw();
        let added = 0;
        let updated = 0;

        for (const sd of sheetDealers) {
            const existingDealer = dealers.find(d => d.businessName.toLowerCase() === sd.businessName.toLowerCase());

            // Smarter Address Splitting
            const addressParts = sd.address.split(',').map((p: string) => p.trim());
            const district = addressParts.length >= 1 ? addressParts[addressParts.length - 1] : '';
            const city = addressParts.length >= 2 ? addressParts[addressParts.length - 2] : (district || 'Unknown');
            const pinMatch = sd.address.match(/\d{6}/);
            const pinCode = pinMatch ? pinMatch[0] : '';

            if (!existingDealer) {
                const { data, error } = await supabase
                    .from('dealers')
                    .insert([{
                        business_name: sd.businessName,
                        contact_person: sd.businessName,
                        phone: sd.phone || '0000000000',
                        district: district || 'Tamil Nadu',
                        city: city || 'Unknown',
                        pin_code: pinCode,
                        address: sd.address,
                        gst_number: sd.gstNumber,
                        balance: 0
                    }])
                    .select()
                    .single();

                if (data && !error) {
                    added++;
                    // Sync to NEW structured tab
                    syncDealerToSheet(transformDealer(data));
                }
            } else {
                const updatedDealer = {
                    ...existingDealer,
                    address: existingDealer.address || sd.address,
                    gstNumber: existingDealer.gstNumber || sd.gstNumber,
                    phone: existingDealer.phone || sd.phone,
                };

                const { error } = await supabase
                    .from('dealers')
                    .update({
                        address: updatedDealer.address,
                        gst_number: updatedDealer.gstNumber,
                        phone: updatedDealer.phone
                    })
                    .eq('id', updatedDealer.id);

                if (!error) {
                    updated++;
                    syncDealerToSheet(updatedDealer);
                }
            }
        }

        await refreshData();
        return { added, updated };
    };

    const importDealersFromTally = async () => {
        const tallyDealers = await parseTallyLedgers();
        let added = 0;
        let updated = 0;

        for (const td of tallyDealers) {
            const existingDealer = dealers.find(d => d.businessName.toLowerCase() === td.businessName.toLowerCase());

            // Extract City/District from address string
            const addressParts = td.address.split(',').map((p: string) => p.trim());
            const district = addressParts.length >= 1 ? addressParts[addressParts.length - 1] : '';
            const city = addressParts.length >= 2 ? addressParts[addressParts.length - 2] : (district || 'Unknown');

            if (!existingDealer) {
                const { data, error } = await supabase
                    .from('dealers')
                    .insert([{
                        business_name: td.businessName,
                        contact_person: td.businessName,
                        phone: td.phone || '0000000000',
                        district: district || 'Tamil Nadu',
                        city: city || 'Unknown',
                        pin_code: '',
                        address: td.address,
                        gst_number: td.gstNumber,
                        balance: td.balance || 0
                    }])
                    .select()
                    .single();

                if (data && !error) {
                    added++;
                    syncDealerToSheet(transformDealer(data));
                }
            } else {
                // Update existing with REAL tally balance and info
                const { error } = await supabase
                    .from('dealers')
                    .update({
                        balance: td.balance, // Force update to real tally balance
                        gst_number: td.gstNumber || existingDealer.gstNumber,
                        phone: td.phone || existingDealer.phone,
                        address: td.address || existingDealer.address
                    })
                    .eq('id', existingDealer.id);

                if (!error) {
                    updated++;
                    // Refresh local object for sync
                    syncDealerToSheet({
                        ...existingDealer,
                        balance: td.balance,
                        gstNumber: td.gstNumber || existingDealer.gstNumber,
                        phone: td.phone || existingDealer.phone,
                        address: td.address || existingDealer.address
                    });
                }
            }
        }

        await refreshData();
        return { added, updated };
    };

    const deleteDealerWithSheet = async (id: string, sheetName: string, deleteTab: boolean) => {
        const { error } = await supabase
            .from('dealers')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Remove from master index
        await removeDealerFromSheet(id, sheetName);

        // Optionally delete the individual sheet tab
        if (deleteTab) {
            await deleteDealerSheet(sheetName);
        }

        await refreshData();
    };

    const syncDealerLedgerToSheet = async (dealerId: string, customDealers?: Dealer[], customTxns?: Transaction[]) => {
        // Find dealer in state
        const dealersToUse = customDealers || dealers;
        let dealer = dealersToUse.find(d => d.id === dealerId);

        // If not in state, it might be a newly created dealer from mobile, refresh first
        if (!dealer && !customDealers) {
            console.warn(`[DataContext] Dealer ${dealerId} not found in state, refreshing cache...`);
            await fetchData();
            dealer = dealers.find(d => d.id === dealerId);
        }

        if (!dealer) {
            throw new Error(`Dealer with ID ${dealerId} not found even after refresh`);
        }

        // 1. Get all transactions for this dealer sorted by date
        const dealerTxns = getDealerTransactions(dealerId, customTxns);

        // 2. Clear current rows in the sheet
        await clearDealerTransactionsForSync(dealer.businessName);

        // 3. Re-append ALL transactions in ONE batch call
        await batchWriteTransactionsToDealerSheet(dealer.businessName, dealerTxns);
    };

    /**
     * Creates tabs for all dealers (if missing) and re-syncs ALL transactions
     * from Supabase state into each dealer's Google Sheet tab.
     */
    const bulkSyncAllDealerLedgers = async (
        onProgress?: (done: number, total: number, name: string) => void
    ): Promise<{ synced: number; errors: number }> => {
        let synced = 0;
        let errors = 0;
        const total = dealers.length;
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        for (let i = 0; i < dealers.length; i++) {
            const dealer = dealers[i];
            try {
                onProgress?.(i, total, dealer.businessName);

                // 1. Ensure the tab exists (creates with header if missing)
                await initializeDealerLedger(dealer, companySettings);

                // 2. Clear old transaction rows (1 API call)
                await clearDealerTransactionsForSync(dealer.businessName);

                // 3. Write ALL transactions in ONE API call (batch instead of per-row)
                const dealerTxns = getDealerTransactions(dealer.id);
                await batchWriteTransactionsToDealerSheet(dealer.businessName, dealerTxns);

                synced++;
            } catch (e) {
                console.error(`[DataContext] bulkSyncAllDealerLedgers failed for ${dealer.businessName}:`, e);
                errors++;
            }

            // Rate limit guard: pause 1s between dealers (quota = 60 writes/min)
            // Each dealer now uses at most 3 calls: getSheet + clear + batchWrite
            if (i < dealers.length - 1) await sleep(1000);
        }

        onProgress?.(total, total, 'Complete');
        return { synced, errors };
    };


    const [lastBackgroundSync, setLastBackgroundSync] = useState<Date | null>(null);
    const [isAutoSyncing, setIsAutoSyncing] = useState(false);

    // PERIODIC SYNC: Automatically catch up mobile transactions to Sheets
    const hasInitialSynced = useRef(false);

    // Initial sync on startup - only runs after data is loaded
    useEffect(() => {
        if (!isLoading && dealers.length > 0 && !hasInitialSynced.current) {
            console.log('[DataContext] Data loaded: Performing startup catch-up sync...');
            hasInitialSynced.current = true;
            performBackgroundSync();
        }
    }, [isLoading, dealers.length]);

    async function performBackgroundSync() {
        if (isAutoSyncing) return;

        // Safety: If main data (dealers) is still loading from Supabase, wait for next cycle
        // Use REFs to ensure we have the latest values from the background worker
        if (isLoadingRef.current || dealersRef.current.length === 0) {
            console.log('[DataContext] Skipping background sync: Data still loading or no dealers in state');
            return;
        }

        setIsAutoSyncing(true);
        try {
            // 1. Find dealers with unsynced transactions (mobile added them while desktop was closed)
            const { data: unsyncedTxns, error: txnError } = await supabase
                .from('transactions')
                .select('id, customer_id')
                .eq('synced_to_sheet', false);

            if (txnError) throw txnError;

            if (unsyncedTxns && unsyncedTxns.length > 0) {
                console.log(`[DataContext] Auto-sync: Found ${unsyncedTxns.length} unsynced transactions. Fetching fresh data for sync...`);

                // 2. Fetch all required data directly for the sync process (bypass React state/refs)
                const [dealersRes, txnsRes, itemsRes, allocationsRes] = await Promise.all([
                    supabase.from('dealers').select('*'),
                    supabase.from('transactions').select('*').order('date', { ascending: true }),
                    supabase.from('invoice_items').select('*'),
                    supabase.from('payment_allocations').select('*')
                ]);

                if (dealersRes.error) throw dealersRes.error;
                if (txnsRes.error) throw txnsRes.error;

                const transformedDealers = (dealersRes.data || []).map(transformDealer);
                const transformedAllocations = (allocationsRes.data || []).map(transformAllocation);
                const rawItems = itemsRes.data || [];

                const fullyTransformedTxns = (txnsRes.data || []).map(row => {
                    const items = rawItems.filter(item => item.transaction_id === row.id);
                    return transformTransaction({ ...row, invoice_items: items }, transformedAllocations);
                });

                // Get unique dealer IDs affected
                const dealerIds = Array.from(new Set(unsyncedTxns.map(t => t.customer_id)));
                console.log(`[DataContext] Auto-sync: Re-syncing ledgers for ${dealerIds.length} dealers to Google Sheets...`);

                for (const dId of dealerIds) {
                    try {
                        // Re-sync the entire ledger using the fresh local data
                        await syncDealerLedgerToSheet(dId, transformedDealers, fullyTransformedTxns);

                        // Mark all transactions for this dealer as synced
                        await supabase
                            .from('transactions')
                            .update({ synced_to_sheet: true })
                            .eq('customer_id', dId)
                            .eq('synced_to_sheet', false);

                        // Mark dealer meta as synced
                        await supabase
                            .from('dealers')
                            .update({ synced_to_sheet: true })
                            .eq('id', dId);

                        console.log(`[DataContext] Successfully auto-synced dealer: ${dId}`);
                    } catch (err) {
                        console.error(`[DataContext] Background sync failed for dealer ${dId}:`, err);
                    }
                }

                // Also refresh the UI state so the user sees the synced status if they open it
                fetchData();
                setLastBackgroundSync(new Date());
            } else {
                console.log('[DataContext] No unsynced transactions found during background check');
            }
        } catch (err) {
            console.error('[DataContext] Periodic sync error:', err);
        } finally {
            setIsAutoSyncing(false);
        }
    }

    const performBackgroundSyncRef = useRef<() => Promise<void>>(performBackgroundSync);
    useEffect(() => {
        performBackgroundSyncRef.current = performBackgroundSync;
    }, [performBackgroundSync]);

    useEffect(() => {
        // Weekly periodic sync (every 5 minutes)
        const intervalId = setInterval(async () => {
            console.log('[DataContext] Background Interval: Triggering periodic sync check...');
            if (performBackgroundSyncRef.current) {
                await performBackgroundSyncRef.current();
            }
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(intervalId);
    }, []);

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
            bulkSyncDealers,
            syncAllDealerTabs,
            importDealersFromSheet,
            importDealersFromTally,
            deleteDealerWithSheet,
            syncDealerLedgerToSheet,
            bulkSyncAllDealerLedgers,
            addAgent,
            updateAgent,
            deleteAgent,
            addCustomer,
            deleteCustomer,
            getCustomerTransactions,
            trackingData,
            loadingTracking,
            companySettings,
            lastBackgroundSync
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
