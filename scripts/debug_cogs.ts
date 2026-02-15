import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debugInvoiceItems() {
    console.log('Fetching transactions with invoice_items...');

    const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
            id, 
            type, 
            amount, 
            date, 
            invoice_items (
                id, 
                product_name, 
                quantity, 
                product_id
            )
        `)
        .eq('type', 'INVOICE')
        .order('date', { ascending: false })
        .limit(3);

    if (error) {
        console.error('Error fetching transactions:', error);
        return;
    }

    console.log(`Fetched ${transactions.length} invoices.`);

    transactions.forEach((txn, index) => {
        console.log(`\nInvoice #${index + 1} (ID: ${txn.id})`);
        console.log(`Amount: ${txn.amount}`);
        console.log(`Date: ${txn.date}`);
        console.log(`Items Count: ${txn.invoice_items?.length || 0}`);

        if (txn.invoice_items && txn.invoice_items.length > 0) {
            console.log('Items Preview:', JSON.stringify(txn.invoice_items, null, 2));
        } else {
            console.log('WARNING: No items found for this invoice.');
        }
    });

    // Check if invoice_items table has any data at all
    const { count, error: countError } = await supabase
        .from('invoice_items')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error('Error counting invoice_items:', countError);
    } else {
        console.log(`\nTotal rows in invoice_items table: ${count}`);
    }
}

debugInvoiceItems();
