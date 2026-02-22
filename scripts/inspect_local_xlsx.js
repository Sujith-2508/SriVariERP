
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join('c:', 'Users', 'sujit', 'Documents', 'GitHub', 'Sri Vari project', 'Ledger of dealers and suppliers', 'Suupliers Statements', 'Supplier_Group3_Ledger.xlsx');
const outputFilePath = path.join('c:', 'Users', 'sujit', 'Documents', 'GitHub', 'Sri Vari project', 'SriVariERP', 'local_xlsx_inspection_utf8.txt');

try {
    const workbook = XLSX.readFile(filePath);
    let output = '';
    output += 'Sheet Names: ' + JSON.stringify(workbook.SheetNames) + '\n';

    workbook.SheetNames.forEach(name => {
        output += `\n--- Previewing Sheet: ${name} ---\n`;
        const sheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        rows.slice(0, 15).forEach((row, i) => {
            output += `Row ${i}: ` + JSON.stringify(row) + '\n';
        });
    });

    fs.writeFileSync(outputFilePath, output, 'utf-8');
    console.log('Inspection results written to ' + outputFilePath);
} catch (e) {
    console.error('Error reading file:', e);
}
