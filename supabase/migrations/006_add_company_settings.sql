-- Create company_settings table to store company and bank details for invoices
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

-- Insert default company settings
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
) VALUES (
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
) ON CONFLICT DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_company_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_company_settings_timestamp
  BEFORE UPDATE ON company_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_company_settings_updated_at();

-- Comment on table
COMMENT ON TABLE company_settings IS 'Stores company and bank details for invoice generation';
