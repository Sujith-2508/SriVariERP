// Database types that match your Supabase schema
// These types should be updated to match your actual Supabase table structure

export type Database = {
    public: {
        Tables: {
            dealers: {
                Row: {
                    id: string;
                    business_name: string;
                    contact_person: string;
                    phone: string;
                    district: string;
                    city: string;
                    pin_code: string;
                    address: string | null;
                    gst_number: string | null;
                    balance: number;
                    last_transaction_date: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    business_name: string;
                    contact_person: string;
                    phone: string;
                    district: string;
                    city: string;
                    pin_code: string;
                    address?: string | null;
                    gst_number?: string | null;
                    balance?: number;
                    last_transaction_date?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    business_name?: string;
                    contact_person?: string;
                    phone?: string;
                    district?: string;
                    city?: string;
                    pin_code?: string;
                    address?: string | null;
                    gst_number?: string | null;
                    balance?: number;
                    last_transaction_date?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            products: {
                Row: {
                    id: string;
                    product_id: string;
                    name: string;
                    category: string;
                    price: number;
                    stock: number;
                    gst_rate: number;
                    sku: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    product_id: string;
                    name: string;
                    category: string;
                    price: number;
                    stock?: number;
                    gst_rate?: number;
                    sku?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    product_id?: string;
                    name?: string;
                    category?: string;
                    price?: number;
                    stock?: number;
                    gst_rate?: number;
                    sku?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            transactions: {
                Row: {
                    id: string;
                    customer_id: string;
                    type: 'INVOICE' | 'PAYMENT';
                    amount: number;
                    date: string;
                    reference_id: string | null;
                    notes: string | null;
                    agent_name: string | null;
                    collection_date: string | null;
                    credit_days: number | null;
                    due_date: string | null;
                    vehicle_name: string | null;
                    vehicle_number: string | null;
                    destination: string | null;
                    transport_charges: number | null;
                    payment_terms: string | null;
                    discount_percent: number | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    customer_id: string;
                    type: 'INVOICE' | 'PAYMENT';
                    amount: number;
                    date?: string;
                    reference_id?: string | null;
                    notes?: string | null;
                    agent_name?: string | null;
                    collection_date?: string | null;
                    credit_days?: number | null;
                    due_date?: string | null;
                    vehicle_name?: string | null;
                    vehicle_number?: string | null;
                    destination?: string | null;
                    transport_charges?: number | null;
                    payment_terms?: string | null;
                    discount_percent?: number | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    customer_id?: string;
                    type?: 'INVOICE' | 'PAYMENT';
                    amount?: number;
                    date?: string;
                    reference_id?: string | null;
                    notes?: string | null;
                    agent_name?: string | null;
                    collection_date?: string | null;
                    credit_days?: number | null;
                    due_date?: string | null;
                    vehicle_name?: string | null;
                    vehicle_number?: string | null;
                    destination?: string | null;
                    transport_charges?: number | null;
                    payment_terms?: string | null;
                    discount_percent?: number | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'transactions_customer_id_fkey';
                        columns: ['customer_id'];
                        referencedRelation: 'dealers';
                        referencedColumns: ['id'];
                    }
                ];
            };
            invoice_items: {
                Row: {
                    id: string;
                    transaction_id: string;
                    product_id: string;
                    product_name: string;
                    quantity: number;
                    unit_price: number;
                    cgst: number;
                    sgst: number;
                    igst: number;
                    cgst_amount: number;
                    sgst_amount: number;
                    igst_amount: number;
                    discount: number;
                    discount_amount: number;
                    total: number;
                    gst_amount: number | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    transaction_id: string;
                    product_id: string;
                    product_name: string;
                    quantity: number;
                    unit_price: number;
                    cgst?: number;
                    sgst?: number;
                    igst?: number;
                    cgst_amount?: number;
                    sgst_amount?: number;
                    igst_amount?: number;
                    discount?: number;
                    discount_amount?: number;
                    total: number;
                    gst_amount?: number | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    transaction_id?: string;
                    product_id?: string;
                    product_name?: string;
                    quantity?: number;
                    unit_price?: number;
                    cgst?: number;
                    sgst?: number;
                    igst?: number;
                    cgst_amount?: number;
                    sgst_amount?: number;
                    igst_amount?: number;
                    discount?: number;
                    discount_amount?: number;
                    total?: number;
                    gst_amount?: number | null;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'invoice_items_transaction_id_fkey';
                        columns: ['transaction_id'];
                        referencedRelation: 'transactions';
                        referencedColumns: ['id'];
                    }
                ];
            };
            payment_allocations: {
                Row: {
                    id: string;
                    invoice_id: string;
                    invoice_ref: string;
                    receipt_id: string;
                    receipt_ref: string;
                    amount: number;
                    date: string;
                    agent_name: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    invoice_id: string;
                    invoice_ref: string;
                    receipt_id: string;
                    receipt_ref: string;
                    amount: number;
                    date?: string;
                    agent_name?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    invoice_id?: string;
                    invoice_ref?: string;
                    receipt_id?: string;
                    receipt_ref?: string;
                    amount?: number;
                    date?: string;
                    agent_name?: string | null;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'payment_allocations_invoice_id_fkey';
                        columns: ['invoice_id'];
                        referencedRelation: 'transactions';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'payment_allocations_receipt_id_fkey';
                        columns: ['receipt_id'];
                        referencedRelation: 'transactions';
                        referencedColumns: ['id'];
                    }
                ];
            };
            agents: {
                Row: {
                    id: string;
                    name: string;
                    phone: string;
                    area: string | null;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    phone: string;
                    area?: string | null;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    phone?: string;
                    area?: string | null;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
        };
        Views: {};
        Functions: {};
        Enums: {};
        CompositeTypes: {};
    };
};

// Helper types for easier usage
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
