// Dealer (formerly Customer) - represents business partners/retailers
export interface Dealer {
  id: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  district: string;
  city: string;
  state?: string;
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
  costPrice?: number;          // Cost price for COGS calculation
  stock: number;
  gstRate: number;
  hsnCode?: string;
  unit?: string;
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
  hsnCode?: string;
  unit?: string;
  gstRate?: number;
}

// Agent for collections
export interface Agent {
  id: string;
  name: string;
  phone: string;
  area?: string;
  division?: string;           // Collection division/zone
  collectionTarget?: number;   // Monthly collection target amount
  monthlySalary?: number;      // Monthly salary for the agent
  isActive: boolean;
  agentId?: string;            // Login ID
  password?: string;           // Login password (only used for creating/updating)
}

// Company settings for invoices
export interface CompanySettings {
  id: string;
  companyName: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  gstNumber?: string;
  panNumber?: string;
  phone?: string;
  email?: string;
  // Bank Details
  bankName?: string;
  bankBranch?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  accountType?: string;
}

// Supplier - production companies you purchase from
export interface Supplier {
  id: string;
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  gstNumber?: string;
  isActive: boolean;
}

// Purchase bill from supplier
export interface Purchase {
  id: string;
  purchaseBillNo: string;
  supplierId?: string;
  supplierName: string;
  purchaseDate: Date;
  totalAmount: number;
  gstAmount: number;
  discountAmount: number;
  freightCharges: number;  // Transport/freight expenses
  otherExpenses: number;   // Other miscellaneous expenses
  netAmount: number;
  paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID';
  items?: PurchaseItem[];
  notes?: string;
}

// Items in a purchase bill
export interface PurchaseItem {
  id?: string;
  purchaseId?: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  sellingPrice?: number;
  gstRate: number;
  gstAmount: number;
  total: number;
  hsnCode?: string;
  unit?: string;
}

// Agent tracking - Real-time status
export interface AgentStatus {
  id: string;
  agentId: string;
  isActive: boolean;
  lastActiveAt: Date;
  currentLatitude?: number;
  currentLongitude?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Agent tracking - Daily attendance
export interface Attendance {
  id: string;
  agentId: string;
  date: Date;
  checkInTime?: Date;
  checkOutTime?: Date;
  totalHours?: number;
  status?: 'PRESENT' | 'ABSENT';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Agent tracking - GPS location history
export interface AgentLocation {
  id: string;
  agentId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  recordedAt: Date;
  createdAt: Date;
}

// Combined agent tracking data for UI
export interface AgentTrackingData {
  agent: Agent;
  status?: AgentStatus;
  latestLocation?: AgentLocation;
  todayAttendance?: Attendance;
}

// Purchase Management - Supplier
export interface SupplierData {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  gstNumber?: string;
  balance: number; // Credit owed TO supplier
  lastTransactionDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Purchase Management - Purchase Bill
export interface PurchaseBillData {
  id: string;
  supplierId: string;
  billNumber: string;
  billDate: Date;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate?: Date;
  items?: any[]; // JSONB array of purchase items
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Purchase Management - Purchase Payment
export interface PurchasePaymentData {
  id: string;
  supplierId: string;
  paymentNumber: string;
  paymentDate: Date;
  amount: number;
  paymentMode: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'OTHER';
  referenceNumber?: string;
  notes?: string;
  createdAt: Date;
}

// Purchase Management - Purchase Allocation (FIFO)
export interface PurchaseAllocationData {
  id: string;
  billId: string;
  billNumber: string;
  paymentId: string;
  paymentNumber: string;
  amount: number;
  allocationDate: Date;
  createdAt: Date;
}

// Agent Salary Management
export interface AgentSalaryData {
  id: string;
  agentId: string;
  month: number;
  year: number;
  baseSalary: number;
  travelExpense: number;
  stayExpense: number;
  foodExpense: number;
  otherExpense: number;
  totalExpense: number;
  netSalary: number;
  paymentStatus: 'PENDING' | 'PAID';
  paidDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Company General Expenses
export interface CompanyExpense {
  id: string;
  expenseType: 'GODOWN_RENT' | 'ELECTRICITY_BILL' | 'OFFICE_RENT' | 'OTHER';
  customName?: string; // For 'OTHER' type
  amount: number;
  date: Date;
  month: number;
  year: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ViewState = 'DASHBOARD' | 'BILLING' | 'INVENTORY' | 'DEALERS' | 'COLLECTIONS' | 'AGENTS' | 'REPORTS' | 'SETTINGS' | 'PURCHASES';

// Global Electron Types
declare global {
  interface Window {
    electron: {
      whatsapp: {
        onQR: (callback: (qr: string) => void) => void;
        onReady: (callback: () => void) => void;
        onAuthenticated: (callback: () => void) => void;
        onAuthFailure: (callback: (msg: string) => void) => void;
        onStatus: (callback: (status: string) => void) => void;
        sendPDF: (phoneNumber: string, pdfBase64: string, filename?: string, caption?: string) => Promise<{ success: boolean }>;
        getStatus: () => Promise<string>;
        logout: () => Promise<{ success: boolean }>;
      };
    };
  }
}
