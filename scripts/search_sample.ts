
const fs = require('fs');

const refinedSuppliers = [
    "ARUN RUBBER PRODUCTS"
];

const data = JSON.parse(fs.readFileSync('ledger_sample_5000.json', 'utf-8'));

let currentSupplier = null;
let isRefined = false;
let output = [];

for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    if (row[0].toLowerCase().startsWith('ledger:')) {
        currentSupplier = (row[1] || row[0].replace(/ledger:?/i, '')).trim();
        isRefined = refinedSuppliers.some(s => s.toLowerCase() === currentSupplier.toLowerCase());
        continue;
    }

    if (isRefined) {
        output.push(`Row ${i + 1}: ${JSON.stringify(row)}`);
    }
}

fs.writeFileSync('arun_rubber_rows.txt', output.join('\n'));
console.log('Saved to arun_rubber_rows.txt');
