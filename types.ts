// Dealer (formerly Customer) - represents business partners/retailers
export interface Dealer {
  id: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  district: string;
  city: string;
  pinCode: string;
  address?: string;
  gstNumber?: string;
  balance: number;
  lastTransactionDate?: Date;
}

// Keeping Customer as alias for backward compatibility
export type Customer = Dealer;

export interface Product {
  id: string;
  productId: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  gstRate: number;
  sku?: string;
}

export enum TransactionType {
  INVOICE = 'INVOICE',
  PAYMENT = 'PAYMENT',
}

// Payment allocation tracking - which payment reduced which invoice
export interface PaymentAllocation {
  invoiceId: string;      // Transaction ID of the invoice
  invoiceRef: string;     // INV001, INV002, etc.
  receiptId: string;      // Transaction ID of the payment
  receiptRef: string;     // R001, R002, etc.
  amount: number;         // Amount applied to this invoice
  date: Date;             // When payment was made
  agentName?: string;     // Who collected
}

export interface Transaction {
  id: string;
  customerId: string;
  type: TransactionType;
  amount: number;
  date: Date;
  referenceId?: string;
  items?: InvoiceItem[];
  notes?: string;
  // Payment specific fields
  agentName?: string;
  collectionDate?: Date;
  paymentAllocations?: PaymentAllocation[];  // For payments: which invoices were reduced
  // Invoice specific fields
  creditDays?: number;       // Payment terms in days (e.g., 30, 60, 90)
  dueDate?: Date;            // Calculated: date + creditDays
  vehicleName?: string;
  vehicleNumber?: string;
  destination?: string;
  transportCharges?: number;
  paymentTerms?: string;
  discountPercent?: number;
}

export interface InvoiceItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  cgst: number;
  sgst: number;
  igst: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  discount: number;
  discountAmount: number;
  total: number;
  gstAmount?: number;
}

// Agent for collections
export interface Agent {
  id: string;
  name: string;
  phone: string;
  area?: string;
  division?: string;           // Collection division/zone
  collectionTarget?: number;   // Monthly collection target amount
  isActive: boolean;
}

export type ViewState = 'DASHBOARD' | 'BILLING' | 'INVENTORY' | 'DEALERS' | 'COLLECTIONS' | 'AGENTS' | 'REPORTS' | 'SETTINGS';