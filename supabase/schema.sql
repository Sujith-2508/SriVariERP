-- Supabase SQL Schema for Sri Vari Enterprises
-- Run this in Supabase SQL Editor to create the tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Dealers/Customers table
CREATE TABLE IF NOT EXISTS dealers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    phone TEXT NOT NULL,
    district TEXT NOT NULL,
    city TEXT NOT NULL,
    pin_code TEXT NOT NULL,
    address TEXT,
    gst_number TEXT,
    balance DECIMAL(12, 2) DEFAULT 0,
    last_transaction_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock INTEGER DEFAULT 0,
    gst_rate DECIMAL(5, 2) DEFAULT 18.00,
    sku TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table (Invoices and Payments)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('INVOICE', 'PAYMENT')),
    amount DECIMAL(12, 2) NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    reference_id TEXT,
    notes TEXT,
    agent_name TEXT,
    collection_date TIMESTAMPTZ,
    credit_days INTEGER,
    due_date TIMESTAMPTZ,
    vehicle_name TEXT,
    vehicle_number TEXT,
    destination TEXT,
    transport_charges DECIMAL(10, 2),
    payment_terms TEXT,
    discount_percent DECIMAL(5, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice Items table
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    cgst DECIMAL(5, 2) DEFAULT 0,
    sgst DECIMAL(5, 2) DEFAULT 0,
    igst DECIMAL(5, 2) DEFAULT 0,
    cgst_amount DECIMAL(10, 2) DEFAULT 0,
    sgst_amount DECIMAL(10, 2) DEFAULT 0,
    igst_amount DECIMAL(10, 2) DEFAULT 0,
    discount DECIMAL(5, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL,
    gst_amount DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Allocations table (FIFO tracking)
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    invoice_ref TEXT NOT NULL,
    receipt_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    receipt_ref TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    agent_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    area TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_transaction_id ON invoice_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_id ON payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_receipt_id ON payment_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_dealers_business_name ON dealers(business_name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Enable Row Level Security (RLS)
ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated access (adjust as needed)
-- For now, allow all authenticated users full access
CREATE POLICY "Allow all access to dealers" ON dealers FOR ALL USING (true);
CREATE POLICY "Allow all access to products" ON products FOR ALL USING (true);
CREATE POLICY "Allow all access to transactions" ON transactions FOR ALL USING (true);
CREATE POLICY "Allow all access to invoice_items" ON invoice_items FOR ALL USING (true);
CREATE POLICY "Allow all access to payment_allocations" ON payment_allocations FOR ALL USING (true);
CREATE POLICY "Allow all access to agents" ON agents FOR ALL USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_dealers_updated_at BEFORE UPDATE ON dealers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
