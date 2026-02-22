import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { google } from 'googleapis';

// 1. Load Credentials
const envFile = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ACCOUNT_KEY = env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !SERVICE_ACCOUNT_KEY) {
    console.error('❌ Missing credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);

// 2. Auth for Google Sheets
const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
});

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

const BACKUP_SHEET_NAME = 'Supabase Dealer Statements Backup';

async function findOrCreateBackupSheet() {
    // If you have an existing Sheet ID, you can paste it here to avoid permission issues
    const EXISTING_ID = '';
    if (EXISTING_ID) return EXISTING_ID;

    console.log('✨ Creating new backup sheet...');
    try {
        const ss = await sheets.spreadsheets.create({
            requestBody: { properties: { title: BACKUP_SHEET_NAME } }
        });
        console.log(`✅ Created new sheet ID: ${ss.data.spreadsheetId}`);
        return ss.data.spreadsheetId!;
    } catch (e: any) {
        console.error('❌ Failed to create spreadsheet:', e.message);
        console.log('💡 TIP: Create a Google Sheet manually and share it with: ' + credentials.client_email);
        throw e;
    }
}

async function main() {
    try {
        const spreadsheetId = await findOrCreateBackupSheet();

        // 1. Fetch Dealers
        console.log('📡 Fetching dealers from Supabase...');
        const { data: dealers, error: dealerErr } = await supabase.from('dealers').select('*');
        if (dealerErr || !dealers) throw new Error(`Dealer fetch failed: ${dealerErr?.message}`);
        console.log(`👥 Found ${dealers.length} dealers.`);

        // 2. Fetch All Transactions (Invoices and Payments)
        console.log('📡 Fetching transaction history...');

        // Fetch Invoices
        const { data: invoices, error: invErr } = await supabase.from('mobile_invoice_view').select('*');
        if (invErr) console.warn('⚠️ Could not fetch invoices:', invErr.message);

        // Fetch Payments
        const { data: payments, error: payErr } = await supabase.from('transactions')
            .select('*')
            .eq('type', 'PAYMENT');
        if (payErr) console.warn('⚠️ Could not fetch payments:', payErr.message);

        const groupInvoices = (invoices || []).reduce((acc: any, inv: any) => {
            const id = inv.dealer_id || inv.dealerId;
            if (!acc[id]) acc[id] = [];
            acc[id].push(inv);
            return acc;
        }, {});

        const groupPayments = (payments || []).reduce((acc: any, pay: any) => {
            const id = pay.customer_id;
            if (!acc[id]) acc[id] = [];
            acc[id].push(pay);
            return acc;
        }, {});

        // 3. Process Each Dealer
        for (const dealer of dealers) {
            const dealerId = dealer.id;
            const dealerName = dealer.business_name;
            const tabName = dealerName.substring(0, 31).toUpperCase().replace(/[*\?\[\]\/\\']/g, '_');

            console.log(`📊 Processing ${dealerName}...`);

            // Combine and Sort Transactions
            const history: any[] = [];

            // Add Invoices
            (groupInvoices[dealerId] || []).forEach((inv: any) => {
                history.push({
                    date: inv.bill_date || inv.billDate,
                    ref: inv.bill_number || inv.billNumber,
                    particulars: `Invoice ${inv.bill_number || inv.billNumber}`,
                    debit: inv.amount || 0,
                    credit: 0
                });
            });

            // Add Payments
            (groupPayments[dealerId] || []).forEach((pay: any) => {
                history.push({
                    date: pay.date.split('T')[0],
                    ref: pay.reference_id,
                    particulars: `Payment - ${pay.notes || 'CASH'}`,
                    debit: 0,
                    credit: pay.amount || 0
                });
            });

            // Sort by Date
            history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Prepare Rows
            const rows = [['Date', 'Ref No', 'Particulars', 'Debit', 'Credit', 'Balance']];
            let runningBalance = 0;
            history.forEach(tx => {
                runningBalance += (tx.debit - tx.credit);
                rows.push([tx.date, tx.ref, tx.particulars, tx.debit, tx.credit, runningBalance]);
            });

            // Ensure Tab Exists
            if (!spreadsheetId) continue;
            await ensureTabExists(spreadsheetId, tabName);

            // Update Tab Content
            await sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: `'${tabName}'!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: rows }
            } as any);
        }

        console.log('🎉 Backup complete!');
        console.log(`🔗 View Backup: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);

    } catch (err: any) {
        console.error('❌ Sync failed:', err.message);
    }
}

async function ensureTabExists(spreadsheetId: string, title: string) {
    const ss = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetsList = ss.data.sheets || [];
    if (sheetsList.some(s => s.properties?.title === title)) return;

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{ addSheet: { properties: { title } } }]
        }
    });
}

main();
