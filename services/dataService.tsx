import React, { createContext, useContext, useState, useEffect } from 'react';
import { Customer, Product, Transaction, TransactionType, InvoiceItem } from '../types';
import { MOCK_CUSTOMERS, MOCK_PRODUCTS, MOCK_TRANSACTIONS } from '../constants';

interface DataContextType {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  createInvoice: (customerId: string, items: InvoiceItem[], totalAmount: number) => Promise<string>;
  recordPayment: (customerId: string, amount: number, method: string, reference?: string) => Promise<string>;
  updateStock: (productId: string, quantity: number) => void;
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [customers, setCustomers] = useState<Customer[]>(MOCK_CUSTOMERS);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);

  const updateStock = (productId: string, quantity: number) => {
    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, stock: p.stock - quantity } : p
    ));
  };

  const addProduct = (productData: Omit<Product, 'id'>) => {
    const newProduct = { ...productData, id: `p${Date.now()}` };
    setProducts(prev => [newProduct, ...prev]);
  };

  const updateProduct = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const createInvoice = async (customerId: string, items: InvoiceItem[], totalAmount: number) => {
    // 1. Create Transaction Record
    const newTxn: Transaction = {
      id: `inv-${Date.now()}`,
      customerId,
      type: TransactionType.INVOICE,
      amount: totalAmount,
      date: new Date(),
      referenceId: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
      items,
    };

    setTransactions(prev => [newTxn, ...prev]);

    // 2. Update Customer Balance (Debit)
    setCustomers(prev => prev.map(c => 
      c.id === customerId ? { ...c, balance: c.balance + totalAmount, lastTransactionDate: new Date() } : c
    ));

    // 3. Reduce Stock
    items.forEach(item => {
      updateStock(item.productId, item.quantity);
    });

    return newTxn.referenceId || 'UNKNOWN';
  };

  const recordPayment = async (customerId: string, amount: number, method: string, reference?: string) => {
    const receiptId = reference || `RCPT-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // 1. Create Transaction
    const newTxn: Transaction = {
      id: `pay-${Date.now()}`,
      customerId,
      type: TransactionType.PAYMENT,
      amount: amount,
      date: new Date(),
      referenceId: receiptId,
      notes: `via ${method}`,
    };

    setTransactions(prev => [newTxn, ...prev]);

    // 2. Update Customer Balance (Credit - Reduce the balance)
    setCustomers(prev => prev.map(c => 
      c.id === customerId ? { ...c, balance: c.balance - amount, lastTransactionDate: new Date() } : c
    ));

    return receiptId;
  };

  return (
    <DataContext.Provider value={{ products, customers, transactions, createInvoice, recordPayment, updateStock, addProduct, updateProduct, deleteProduct }}>
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