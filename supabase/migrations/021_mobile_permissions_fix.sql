-- Migration: Ensure proper permissions for Mobile App
-- Standard Supabase projects might have restricted access for 'anon' and 'authenticated' roles by default

-- Grant access to tables
GRANT ALL ON dealers TO authenticated, anon;
GRANT ALL ON products TO authenticated, anon;
GRANT ALL ON transactions TO authenticated, anon;
GRANT ALL ON invoice_items TO authenticated, anon;
GRANT ALL ON payment_allocations TO authenticated, anon;
GRANT ALL ON agents TO authenticated, anon;
GRANT ALL ON scheduled_visits TO authenticated, anon;

-- Grant access to views from migration 007
GRANT SELECT ON mobile_invoice_view TO authenticated, anon;
GRANT SELECT ON company_outstanding_view TO authenticated, anon;
GRANT SELECT ON mobile_dealers_view TO authenticated, anon;

-- Grant access to sequences (if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
