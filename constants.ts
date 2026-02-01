import { Dealer, Product, Transaction, TransactionType, Agent } from './types';

// Product ID format: PDI-XXX
export const MOCK_PRODUCTS: Product[] = [
  { id: 'p1', productId: 'PDI-001', name: 'Non-Stick Tawa 28cm', category: 'Cookware', price: 850, stock: 150, gstRate: 0.18 },
  { id: 'p2', productId: 'PDI-002', name: 'Deep Kadai 3L', category: 'Cookware', price: 1200, stock: 80, gstRate: 0.18 },
  { id: 'p3', productId: 'PDI-003', name: 'Fry Pan 24cm', category: 'Cookware', price: 950, stock: 200, gstRate: 0.18 },
  { id: 'p4', productId: 'PDI-004', name: 'Pressure Cooker 5L', category: 'Appliances', price: 2400, stock: 45, gstRate: 0.12 },
  { id: 'p5', productId: 'PDI-005', name: 'Glass Lid Universal', category: 'Accessories', price: 350, stock: 500, gstRate: 0.12 },
];

// Dealers with City and PinCode fields
export const MOCK_DEALERS: Dealer[] = [
  {
    id: 'c1',
    businessName: 'Royal Kitchen World',
    contactPerson: 'Rajesh Gupta',
    phone: '9876543210',
    district: 'North District',
    city: 'Chennai',
    pinCode: '600001',
    address: '123, Anna Nagar Main Road',
    gstNumber: '33AABCU9603R1ZM',
    balance: 45000,
    lastTransactionDate: new Date('2023-10-15')
  },
  {
    id: 'c2',
    businessName: 'City Home Needs',
    contactPerson: 'Amit Kumar',
    phone: '9876543211',
    district: 'Central Market',
    city: 'Coimbatore',
    pinCode: '641001',
    address: '45, RS Puram',
    balance: 12500,
    lastTransactionDate: new Date('2023-10-20')
  },
  {
    id: 'c3',
    businessName: 'Lakshmi Traders',
    contactPerson: 'Suresh Reddy',
    phone: '9876543212',
    district: 'South Extension',
    city: 'Madurai',
    pinCode: '625001',
    balance: 0,
    lastTransactionDate: new Date('2023-10-25')
  },
  {
    id: 'c4',
    businessName: 'Modern Appliances',
    contactPerson: 'Vikram Singh',
    phone: '9876543213',
    district: 'West Hub',
    city: 'Trichy',
    pinCode: '620001',
    address: '78, Cantonment Area',
    gstNumber: '33AABCU9603R2ZN',
    balance: 82000,
    lastTransactionDate: new Date('2023-09-01')
  },
];

export const MOCK_CUSTOMERS = MOCK_DEALERS;

// Helper to add days to a date
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Mock transactions with credit days and due dates
export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn1',
    customerId: 'c1',
    type: TransactionType.INVOICE,
    amount: 25000,
    date: new Date('2025-06-15'),
    referenceId: 'INV001',
    creditDays: 90,
    dueDate: addDays(new Date('2025-06-15'), 90), // Sept 13
  },
  {
    id: 'txn2',
    customerId: 'c1',
    type: TransactionType.INVOICE,
    amount: 15000,
    date: new Date('2025-07-10'),
    referenceId: 'INV002',
    creditDays: 60,
    dueDate: addDays(new Date('2025-07-10'), 60),
  },
  {
    id: 'txn3',
    customerId: 'c1',
    type: TransactionType.INVOICE,
    amount: 10000,
    date: new Date('2025-08-01'),
    referenceId: 'INV003',
    creditDays: 30,
    dueDate: addDays(new Date('2025-08-01'), 30),
  },
  {
    id: 'txn4',
    customerId: 'c1',
    type: TransactionType.PAYMENT,
    amount: 5000,
    date: new Date('2025-06-20'),
    referenceId: 'R001',
    notes: 'Part payment via Cash',
    agentName: 'Vikram S.',
    paymentAllocations: [
      {
        invoiceId: 'txn1',
        invoiceRef: 'INV001',
        receiptId: 'txn4',
        receiptRef: 'R001',
        amount: 5000,
        date: new Date('2025-06-20'),
        agentName: 'Vikram S.'
      }
    ]
  },
  {
    id: 'txn5',
    customerId: 'c4',
    type: TransactionType.INVOICE,
    amount: 50000,
    date: new Date('2024-10-01'),  // Old invoice - will be OVERDUE
    referenceId: 'INV004',
    creditDays: 45,
    dueDate: addDays(new Date('2024-10-01'), 45),
  },
  {
    id: 'txn6',
    customerId: 'c4',
    type: TransactionType.INVOICE,
    amount: 32000,
    date: new Date('2024-11-15'),  // Old invoice - will be OVERDUE
    referenceId: 'INV005',
    creditDays: 60,
    dueDate: addDays(new Date('2024-11-15'), 60),
  },
];

// Agents for collection tracking
export const MOCK_AGENTS: Agent[] = [
  { id: 'a1', name: 'Vikram S.', phone: '9876543220', area: 'North Zone', isActive: true },
  { id: 'a2', name: 'Rajesh K.', phone: '9876543221', area: 'South Zone', isActive: true },
  { id: 'a3', name: 'Amit P.', phone: '9876543222', area: 'East Zone', isActive: true },
  { id: 'a4', name: 'Suresh R.', phone: '9876543223', area: 'West Zone', isActive: true },
];

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