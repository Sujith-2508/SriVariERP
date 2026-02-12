-- Ensure company_settings table exists
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL DEFAULT 'SRI VARI ENTERPRISES',
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  pin_code TEXT,
  gst_number TEXT,
  pan_number TEXT,
  phone TEXT,
  email TEXT,
  
  -- Bank Details
  bank_name TEXT,
  bank_branch TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  account_holder_name TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default company settings if the table is empty
INSERT INTO company_settings (
  company_name,
  address_line1,
  address_line2,
  city,
  state,
  pin_code,
  gst_number,
  pan_number,
  bank_name,
  bank_branch,
  account_number,
  ifsc_code,
  account_holder_name
)
SELECT
  'SRI VARI ENTERPRISES',
  'BLOCK NO.9 T.S. NO 609',
  'PALANIYAPPAN STREET',
  'POLLACHI',
  'Tamil Nadu',
  '642001',
  '33DIGPM0162N1Z6',
  'DIGPM0162N',
  'Tamilnad Mercantile Bank (TMB)',
  'Pollachi',
  '090700050900285',
  'TMBL0000079',
  'SRI VARI ENTERPRISES'
WHERE NOT EXISTS (SELECT 1 FROM company_settings);

-- Enable RLS and add public read policy (since we use custom auth/anon client)
DO $$
BEGIN
    -- Enable RLS
    ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

    -- Create policy for public read access if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'company_settings' 
        AND policyname = 'Allow public read access'
    ) THEN
        CREATE POLICY "Allow public read access" ON company_settings FOR SELECT USING (true);
    END IF;
    
    -- Create policy for all access to service role (optional but good practice)
    -- Service role bypasses RLS anyway, so strictly not needed but harmless.
END
$$;
