-- Migration: Add Purchase Management System
-- Run this in Supabase SQL Editor
-- Tracks purchases from suppliers and auto-updates product stock

-- ============================================
-- 1. SUPPLIERS TABLE
-- Companies/vendors you purchase products from
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    city TEXT,
    address TEXT,
    gst_number TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. PURCHASES TABLE
-- Purchase bills/invoices from suppliers
-- ============================================
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_bill_no TEXT NOT NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT NOT NULL,  -- Stored for quick access
    purchase_date TIMESTAMPTZ DEFAULT NOW(),
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    gst_amount DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    freight_charges DECIMAL(10, 2) DEFAULT 0,  -- Transport/freight expenses
    other_expenses DECIMAL(10, 2) DEFAULT 0,   -- Miscellaneous expenses
    net_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PARTIAL', 'PAID')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. PURCHASE ITEMS TABLE
-- Products in each purchase bill
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,  -- References products.product_id
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,  -- Purchase price per unit
    selling_price DECIMAL(10, 2),  -- Optional: update selling price
    gst_rate DECIMAL(5, 2) DEFAULT 0,
    gst_amount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL,
    hsn_code TEXT,
    unit TEXT DEFAULT 'PCS',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. TRIGGER: Auto-update product stock on purchase
-- When purchase items are added, increase product stock
-- ============================================
CREATE OR REPLACE FUNCTION update_product_stock_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
    -- Update product stock (increase by purchased quantity)
    UPDATE products 
    SET stock = stock + NEW.quantity,
        updated_at = NOW()
    WHERE product_id = NEW.product_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT on purchase_items
DROP TRIGGER IF EXISTS trigger_update_stock_on_purchase ON purchase_items;
CREATE TRIGGER trigger_update_stock_on_purchase
    AFTER INSERT ON purchase_items
    FOR EACH ROW
    EXECUTE FUNCTION update_product_stock_on_purchase();

-- ============================================
-- 5. TRIGGER: Handle stock adjustment on purchase item delete
-- When purchase items are deleted, decrease product stock
-- ============================================
CREATE OR REPLACE FUNCTION revert_product_stock_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Decrease product stock when purchase item is deleted
    UPDATE products 
    SET stock = GREATEST(0, stock - OLD.quantity),
        updated_at = NOW()
    WHERE product_id = OLD.product_id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_revert_stock_on_delete ON purchase_items;
CREATE TRIGGER trigger_revert_stock_on_delete
    AFTER DELETE ON purchase_items
    FOR EACH ROW
    EXECUTE FUNCTION revert_product_stock_on_delete();

-- ============================================
-- 6. TRIGGER: Update purchase total when items change
-- ============================================
CREATE OR REPLACE FUNCTION update_purchase_total()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE purchases 
    SET total_amount = (
            SELECT COALESCE(SUM(total), 0) 
            FROM purchase_items 
            WHERE purchase_id = COALESCE(NEW.purchase_id, OLD.purchase_id)
        ),
        gst_amount = (
            SELECT COALESCE(SUM(gst_amount), 0) 
            FROM purchase_items 
            WHERE purchase_id = COALESCE(NEW.purchase_id, OLD.purchase_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.purchase_id, OLD.purchase_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_purchase_total ON purchase_items;
CREATE TRIGGER trigger_update_purchase_total
    AFTER INSERT OR UPDATE OR DELETE ON purchase_items
    FOR EACH ROW
    EXECUTE FUNCTION update_purchase_total();

-- ============================================
-- 7. INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON purchase_items(product_id);

-- ============================================
-- 8. Enable Row Level Security
-- ============================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

-- Allow all access (adjust as needed)
CREATE POLICY "Allow all access to suppliers" ON suppliers FOR ALL USING (true);
CREATE POLICY "Allow all access to purchases" ON purchases FOR ALL USING (true);
CREATE POLICY "Allow all access to purchase_items" ON purchase_items FOR ALL USING (true);

-- ============================================
-- 9. Update triggers for updated_at
-- ============================================
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchases_updated_at BEFORE UPDATE ON purchases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. VIEW: Purchase summary for mobile app
-- ============================================
CREATE OR REPLACE VIEW purchase_summary_view AS
SELECT 
    p.id,
    p.purchase_bill_no,
    p.supplier_name,
    p.purchase_date,
    p.total_amount,
    p.gst_amount,
    p.net_amount,
    p.payment_status,
    COUNT(pi.id) AS item_count,
    SUM(pi.quantity) AS total_quantity
FROM purchases p
LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
GROUP BY p.id, p.purchase_bill_no, p.supplier_name, p.purchase_date, 
         p.total_amount, p.gst_amount, p.net_amount, p.payment_status
ORDER BY p.purchase_date DESC;

GRANT SELECT ON purchase_summary_view TO authenticated;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE suppliers IS 'Production companies/vendors to purchase products from';
COMMENT ON TABLE purchases IS 'Purchase bills from suppliers';
COMMENT ON TABLE purchase_items IS 'Products in each purchase bill - auto-updates stock';
COMMENT ON VIEW purchase_summary_view IS 'Purchase summary for reporting';
