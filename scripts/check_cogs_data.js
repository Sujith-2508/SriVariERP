// Simple script to check localStorage products and their cost prices
const fs = require('fs');
const path = require('path');

// Try to find localStorage data in Electron's userData
const possiblePaths = [
    path.join(process.env.APPDATA || '', 'sri-vari-enterprises', 'Local Storage', 'leveldb'),
    path.join(process.env.LOCALAPPDATA || '', 'sri-vari-enterprises', 'Local Storage', 'leveldb'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'sri-vari-enterprises', 'Local Storage', 'leveldb'),
];

console.log('Looking for localStorage data in:');
possiblePaths.forEach(p => console.log(`  - ${p}`));

// For now, let's just check if we can read from a JSON file if it exists
const productsFile = path.join(__dirname, '..', 'products_backup.json');
if (fs.existsSync(productsFile)) {
    const products = JSON.parse(fs.readFileSync(productsFile, 'utf-8'));
    console.log('\nProducts from backup:');
    console.log(`Total products: ${products.length}`);
    console.log(`Products with cost price: ${products.filter(p => p.costPrice && p.costPrice > 0).length}`);
    console.log('\nSample products:');
    products.slice(0, 5).forEach(p => {
        console.log(`  - ${p.name}: costPrice=${p.costPrice}, price=${p.price}`);
    });
} else {
    console.log('\nNo products backup file found.');
    console.log('Please check localStorage in the running app or export products data.');
}

// Also check if we can access Supabase
console.log('\n--- Checking Supabase Connection ---');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.log('Supabase credentials not found in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
    // Check recent invoices
    const { data: invoices, error: invError } = await supabase
        .from('transactions')
        .select('id, reference_id, amount, date')
        .eq('type', 'INVOICE')
        .order('date', { ascending: false })
        .limit(3);

    if (invError) {
        console.error('Error fetching invoices:', invError);
        return;
    }

    console.log(`\nFound ${invoices.length} recent invoices:`);

    for (const inv of invoices) {
        console.log(`\n  Invoice: ${inv.reference_id} (${inv.amount})`);

        // Check invoice items
        const { data: items, error: itemsError } = await supabase
            .from('invoice_items')
            .select('*')
            .eq('transaction_id', inv.id);

        if (itemsError) {
            console.error('    Error fetching items:', itemsError);
        } else {
            console.log(`    Items: ${items.length}`);
            if (items.length > 0) {
                console.log('    Sample item:', {
                    product: items[0].product_name,
                    qty: items[0].quantity,
                    price: items[0].unit_price
                });
            }
        }
    }
}

checkDatabase().then(() => {
    console.log('\n--- Check Complete ---');
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
