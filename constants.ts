import { Dealer, Product, Transaction, TransactionType, Agent } from './types';

// Product ID format: PDI-XXX
export const MOCK_PRODUCTS: Product[] = [];

// Dealers with City and PinCode fields
export const MOCK_DEALERS: Dealer[] = [];

export const MOCK_CUSTOMERS = MOCK_DEALERS;

// Helper to add days to a date
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Mock transactions with credit days and due dates
export const MOCK_TRANSACTIONS: Transaction[] = [];

// Agents for collection tracking
export const MOCK_AGENTS: Agent[] = [];

// Invoice Number Counter
export const INVOICE_PREFIX = 'INV';
export const RECEIPT_PREFIX = 'R';

export const generateInvoiceNumber = (currentCount: number): string => {
  return `${INVOICE_PREFIX}${String(currentCount).padStart(3, '0')}`;
};

export const generateReceiptNumber = (currentCount: number): string => {
  return `${RECEIPT_PREFIX}${String(currentCount).padStart(3, '0')}`;
};

export const generateProductId = (currentCount: number): string => {
  return `PDI-${String(currentCount).padStart(3, '0')}`;
};

export const DEFAULT_COMPANY_SETTINGS = {
  id: 'default',
  companyName: 'SRI VARI ENTERPRISES',
  addressLine1: 'BLOCK NO.9 T.S. NO 609',
  addressLine2: 'PALANIYAPPAN STREET',
  city: 'POLLACHI',
  state: 'Tamil Nadu',
  pinCode: '642001',
  gstNumber: '33DIGPM0162N1Z6',
  panNumber: 'DIGPM0162N',
  bankName: 'Tamilnad Mercantile Bank (TMB)',
  bankBranch: 'Pollachi',
  accountNumber: '090700050900285',
  ifscCode: 'TMBL0000079',
  accountHolderName: 'SRI VARI ENTERPRISES'
};