'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Customer, Product, Transaction, TransactionType, InvoiceItem, PaymentAllocation, Agent } from '../types';
import { supabase } from '../lib/supabase';
import { MOCK_CUSTOMERS, MOCK_PRODUCTS, MOCK_TRANSACTIONS, MOCK_AGENTS } from '../constants';

interface DataContextType {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
  createInvoice: (customerId: string, items: InvoiceItem[], totalAmount: number, invoiceData?: Partial<Transaction>) => Promise<string>;
  recordPayment: (customerId: string, amount: number, method: string, reference?: string, agentName?: string, allocations?: PaymentAllocation[]) => Promise<string>;
  updateStock: (productId: string, quantity: number) => Promise<void>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Flag to use Supabase or fallback to mock data
const USE_SUPABASE = true;

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transform database row to app type
  const transformProduct = (row: any): Product => ({
    id: row.id,
    productId: row.product_id,
    name: row.name,
    category: row.category,
    price: row.price,
    stock: row.stock,
    gstRate: row.gst_rate,
    sku: row.sku,
  });

  const transformDealer = (row: any): Customer => ({
    id: row.id,
    businessName: row.business_name,
    contactPerson: row.contact_person,
    phone: row.phone,
    district: row.district,
    city: row.city,
    pinCode: row.pin_code,
    address: row.address,
    gstNumber: row.gst_number,
    balance: row.balance,
    lastTransactionDate: row.last_transaction_date ? new Date(row.last_transaction_date) : undefined,
  });

  const transformTransaction = (row: any): Transaction => ({
    id: row.id,
    customerId: row.customer_id,
    type: row.type as TransactionType,
    amount: row.amount,
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
    transportCharges: row.transport_charges,
    paymentTerms: row.payment_terms,
    discountPercent: row.discount_percent,
  });

  const transformAgent = (row: any): Agent => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    area: row.area,
    isActive: row.is_active,
  });

  // Fetch all data from Supabase
  const fetchData = useCallback(async () => {
    if (!USE_SUPABASE) {
      // Use mock data as fallback
      setProducts(MOCK_PRODUCTS);
      setCustomers(MOCK_CUSTOMERS);
      setTransactions(MOCK_TRANSACTIONS);
      setAgents(MOCK_AGENTS);
      setIsLoading(false);
      return;
    }

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
      setCustomers(dealersData?.map(transformDealer) || []);
      setTransactions(transactionsData?.map(transformTransaction) || []);
      setAgents(agentsData?.map(transformAgent) || []);

    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to fetch data');
      // Fallback to mock data on error
      setProducts(MOCK_PRODUCTS);
      setCustomers(MOCK_CUSTOMERS);
      setTransactions(MOCK_TRANSACTIONS);
      setAgents(MOCK_AGENTS);
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
    if (!USE_SUPABASE) {
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, stock: p.stock - quantity } : p
      ));
      return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) return;

    const { error } = await supabase
      .from('products')
      .update({ stock: product.stock - quantity })
      .eq('id', productId);

    if (error) {
      console.error('Error updating stock:', error);
      throw error;
    }

    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, stock: p.stock - quantity } : p
    ));
  };

  const addProduct = async (productData: Omit<Product, 'id'>) => {
    if (!USE_SUPABASE) {
      const newProduct = { ...productData, id: `p${Date.now()}` };
      setProducts(prev => [newProduct, ...prev]);
      return;
    }

    const { data, error } = await supabase
      .from('products')
      .insert({
        product_id: productData.productId,
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
  };

  const updateProduct = async (updatedProduct: Product) => {
    if (!USE_SUPABASE) {
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      return;
    }

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
    if (!USE_SUPABASE) {
      setProducts(prev => prev.filter(p => p.id !== id));
      return;
    }

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

  const createInvoice = async (
    customerId: string,
    items: InvoiceItem[],
    totalAmount: number,
    invoiceData?: Partial<Transaction>
  ) => {
    const invoiceCount = transactions.filter(t => t.type === TransactionType.INVOICE).length + 1;
    const referenceId = `INV${String(invoiceCount).padStart(3, '0')}`;
    const now = new Date();
    const creditDays = invoiceData?.creditDays || 30;
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + creditDays);

    if (!USE_SUPABASE) {
      const newTxn: Transaction = {
        id: `inv-${Date.now()}`,
        customerId,
        type: TransactionType.INVOICE,
        amount: totalAmount,
        date: now,
        referenceId,
        items,
        creditDays,
        dueDate,
        ...invoiceData,
      };

      setTransactions(prev => [newTxn, ...prev]);
      setCustomers(prev => prev.map(c =>
        c.id === customerId ? { ...c, balance: c.balance + totalAmount, lastTransactionDate: now } : c
      ));
      items.forEach(item => {
        updateStock(item.productId, item.quantity);
      });

      return referenceId;
    }

    // Insert transaction
    const { data: txnData, error: txnError } = await supabase
      .from('transactions')
      .insert({
        customer_id: customerId,
        type: 'INVOICE',
        amount: totalAmount,
        date: now.toISOString(),
        reference_id: referenceId,
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

    const { error: itemsError } = await supabase
      .from('invoice_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error('Error adding invoice items:', itemsError);
    }

    // Update customer balance
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      const { error: balanceError } = await supabase
        .from('dealers')
        .update({
          balance: customer.balance + totalAmount,
          last_transaction_date: now.toISOString()
        })
        .eq('id', customerId);

      if (balanceError) {
        console.error('Error updating balance:', balanceError);
      }
    }

    // Update stock for each item
    for (const item of items) {
      await updateStock(item.productId, item.quantity);
    }

    // Update local state
    setTransactions(prev => [transformTransaction(txnData), ...prev]);
    setCustomers(prev => prev.map(c =>
      c.id === customerId ? { ...c, balance: c.balance + totalAmount, lastTransactionDate: now } : c
    ));

    return referenceId;
  };

  const recordPayment = async (
    customerId: string,
    amount: number,
    method: string,
    reference?: string,
    agentName?: string,
    allocations?: PaymentAllocation[]
  ) => {
    const receiptCount = transactions.filter(t => t.type === TransactionType.PAYMENT).length + 1;
    const receiptId = reference || `R${String(receiptCount).padStart(3, '0')}`;
    const now = new Date();

    if (!USE_SUPABASE) {
      const newTxn: Transaction = {
        id: `pay-${Date.now()}`,
        customerId,
        type: TransactionType.PAYMENT,
        amount: amount,
        date: now,
        referenceId: receiptId,
        notes: `via ${method}`,
        agentName,
        paymentAllocations: allocations,
      };

      setTransactions(prev => [newTxn, ...prev]);
      setCustomers(prev => prev.map(c =>
        c.id === customerId ? { ...c, balance: c.balance - amount, lastTransactionDate: now } : c
      ));

      return receiptId;
    }

    // Insert payment transaction
    const { data: txnData, error: txnError } = await supabase
      .from('transactions')
      .insert({
        customer_id: customerId,
        type: 'PAYMENT',
        amount: amount,
        date: now.toISOString(),
        reference_id: receiptId,
        notes: `via ${method}`,
        agent_name: agentName,
        collection_date: now.toISOString(),
      })
      .select()
      .single();

    if (txnError) {
      console.error('Error recording payment:', txnError);
      throw txnError;
    }

    // Insert payment allocations if provided
    if (allocations && allocations.length > 0) {
      const allocsToInsert = allocations.map(alloc => ({
        invoice_id: alloc.invoiceId,
        invoice_ref: alloc.invoiceRef,
        receipt_id: txnData.id,
        receipt_ref: receiptId,
        amount: alloc.amount,
        date: now.toISOString(),
        agent_name: agentName,
      }));

      const { error: allocError } = await supabase
        .from('payment_allocations')
        .insert(allocsToInsert);

      if (allocError) {
        console.error('Error inserting allocations:', allocError);
      }
    }

    // Update customer balance
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      const { error: balanceError } = await supabase
        .from('dealers')
        .update({
          balance: customer.balance - amount,
          last_transaction_date: now.toISOString()
        })
        .eq('id', customerId);

      if (balanceError) {
        console.error('Error updating balance:', balanceError);
      }
    }

    // Update local state
    setTransactions(prev => [transformTransaction(txnData), ...prev]);
    setCustomers(prev => prev.map(c =>
      c.id === customerId ? { ...c, balance: c.balance - amount, lastTransactionDate: now } : c
    ));

    return receiptId;
  };

  return (
    <DataContext.Provider value={{
      products,
      customers,
      transactions,
      agents,
      isLoading,
      error,
      createInvoice,
      recordPayment,
      updateStock,
      addProduct,
      updateProduct,
      deleteProduct,
      refreshData
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