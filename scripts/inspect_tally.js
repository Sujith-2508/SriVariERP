const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../../Tally.xlsx');
console.log(`Reading file: ${filePath}`);

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames.find(n => n.includes("Ledger") || n.includes("Vouchers"));
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    let ledgerRowIndex = -1;
    for (let i = 0; i < jsonData.length; i++) {
        const val = jsonData[i][0];
        if (typeof val === 'string' && val.includes("Ledger:")) {
            ledgerRowIndex = i;
            break;
        }
    }

    if (ledgerRowIndex !== -1) {
        console.log(`Found Ledger block starting at row ${ledgerRowIndex}`);
        console.log(JSON.stringify(jsonData.slice(ledgerRowIndex, ledgerRowIndex + 20), null, 2));
    } else {
        console.log("No row starting with 'Ledger:' found.");
        // Maybe check for "Date" header again to see columns
        const headerRow = jsonData.find(row => row.includes("Date"));
        if (headerRow) console.log("Header row:", headerRow);
    }

} catch (e) { console.error(e); }
