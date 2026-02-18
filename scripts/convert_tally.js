const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TALLY_FILE = path.join(__dirname, '../../Tally.xlsx');
const OUTPUT_DIR = path.join(__dirname, '../public/migration');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const logFile = fs.createWriteStream(path.join(__dirname, 'migration_log.txt'));
function log(msg) {
    logFile.write(msg + '\n');
}

function parseDate(dateStr) {

    // Handle Excel serial date or dd-mmm-yy
    if (typeof dateStr === 'number') {
        // Excel base date: Dec 30 1899
        const utc_days = Math.floor(dateStr - 25569);
        const utc_value = utc_days * 86400;
        const date_info = new Date(utc_value * 1000);
        return date_info.toISOString();
    }

    if (typeof dateStr === 'string') {
        // Try to parse "2-Apr-19" format manually if Date.parse fails or gives wrong year
        // Tally often gives '2-Apr-19'
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const day = parseInt(parts[0]);
            const monthStr = parts[1];
            let year = parseInt(parts[2]);
            if (year < 100) year += 2000; // Assume 20xx

            const months = {
                'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
            };
            const month = months[monthStr];
            if (month !== undefined) {
                const d = new Date(Date.UTC(year, month, day));
                return d.toISOString();
            }
        }
        // Fallback
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
}

function generateId() {
    return crypto.randomUUID();
}

log(`Reading file: ${TALLY_FILE}`);
const workbook = XLSX.readFile(TALLY_FILE);
const sheetName = workbook.SheetNames.find(n => n.includes("Ledger") || n.includes("Vouchers"));
if (!sheetName) {
    log("Sheet 'Ledger Vouchers' not found.");
    process.exit(1);
}

const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

const suppliers = [];
const bills = [];
const payments = [];

let currentLedgerName = null;
let currentStructure = null; // { address: string, gst: string, email: string }
let headerRowFound = false;

log("Starting row processing... Total rows: " + jsonData.length);
let i = 0;

while (i < jsonData.length) {
    const row = jsonData[i];
    if (!row) {
        i++;
        continue;
    }
    const firstCol = row[0] ? String(row[0]).trim() : "";

    // 1. Detect Ledger Start
    if (firstCol.startsWith("Ledger:")) {
        // Check if name is in this col or next
        let rawName = firstCol.replace("Ledger:", "").trim();
        if (!rawName && row[1]) {
            rawName = String(row[1]).trim();
        }

        currentLedgerName = rawName;
        currentStructure = { address: "", gst: "", email: "" };
        log(`Processing Ledger: ${currentLedgerName}`);
        i++;

        // Scan for Header and capture Address found in between
        while (i < jsonData.length) {
            const innerRow = jsonData[i];
            if (!innerRow) { i++; continue; }
            const innerFirst = innerRow[0] ? String(innerRow[0]).trim() : "";

            // If we hit header
            if (innerRow.includes("Date") && (innerRow.includes("Particulars") || innerRow.includes("Vch Type"))) {
                headerRowFound = true;
                i++; // Move past header to transactions
                break;
            }

            // If we hit next ledger (shouldn't happen before header usually, but safety check)
            if (innerFirst.startsWith("Ledger:")) {
                break;
            }

            // Capture address/meta lines
            // Usually address is in col 0. unique identifier like GST might be in valid format.
            if (innerFirst.length > 0 && !innerFirst.includes("Date")) {
                // Simple heuristic: if it contains "GSTIN", extract it.
                if (innerFirst.includes("GSTIN")) {
                    currentStructure.gst = innerFirst.split("GSTIN")[1]?.replace(/[:\s]/g, "") || "";
                } else if (innerFirst.includes("@")) {
                    currentStructure.email = innerFirst;
                } else {
                    // Append to address
                    currentStructure.address = (currentStructure.address + " " + innerFirst).trim();
                }
            }
            i++;
        }
    }
    else if (currentLedgerName && headerRowFound) {
        // Process Transactions
        // Loop until next Ledger or empty block or footer
        // Tally sometimes puts "Totals" at bottom.

        if (firstCol.startsWith("Ledger:")) {
            // New block, header flag reset
            headerRowFound = false;
            continue; // Loop will catch detect ledger start
        }

        // Identify end of block by empty rows or "Totals"
        if (firstCol === "" && (!row[1] || row[1] === "")) {
            // Maybe check a few rows ahead to see if it's really the end of the block?
            let isEndOfBlock = true;
            for (let j = 1; j <= 3; j++) {
                if (jsonData[i + j] && (jsonData[i + j][0] || jsonData[i + j][1])) {
                    isEndOfBlock = false;
                    break;
                }
            }
            if (isEndOfBlock) {
                currentLedgerName = null;
                headerRowFound = false;
                i++;
                continue;
            }
        }

        // Expect columns: Date, Particulars, Vch Type, Vch No, Debit, Credit
        // Based on inspection:
        // Col 0: Date
        // Col 1: Particulars (To/By)
        // Col 2: Particulars (Name)
        // Col 3: Vch Type
        // Col 4: Vch No
        // Col 5: Debit
        // Col 6: Credit

        const dateVal = row[0];
        const particulars = row[2] ? String(row[2]) : "";
        let vchType = row[3] ? String(row[3]) : "";
        const debit = row[5];
        const credit = row[6];

        // Fallback for VchType
        if (!vchType && particulars) {
            if (particulars.includes("SALES") || particulars.includes("PURCHASE")) vchType = "Sales";
            else if (particulars.includes("CHEQUE") || particulars.includes("NEFT") || particulars.includes("CASH")) vchType = "Receipt";
        }

        if (dateVal && vchType) {
            const supplierId = crypto.createHash('md5').update(currentLedgerName).digest('hex'); // consistent ID

            // Check if supplier exists, if not add
            if (!suppliers.find(s => s.id === supplierId)) {
                suppliers.push({
                    id: supplierId,
                    name: currentLedgerName,
                    address: currentStructure.address,
                    gstNumber: currentStructure.gst,
                    email: currentStructure.email,
                    balance: 0, // Recalculate later?
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }

            // Map Transactions
            // SALES / PURCHASE (Bill)
            if (["Sales", "Purchase", "Credit Note"].some(t => String(vchType).includes(t))) {
                const amount = Number(debit) || Number(credit) || 0;
                if (amount > 0) {
                    bills.push({
                        id: generateId(),
                        supplierId: supplierId,
                        billNumber: row[4] ? String(row[4]) : "Imported",
                        billDate: parseDate(dateVal),
                        amount: amount,
                        paidAmount: 0, // Assume unpaid initially? Or link? Complex.
                        balance: amount,
                        notes: `Imported Tally: ${vchType} - ${particulars}`,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        items: []
                    });
                }
            }
            // RECEIPT / PAYMENT (Payment)
            else if (["Receipt", "Payment", "Debit Note", "Contra"].some(t => String(vchType).includes(t))) {
                const amount = Number(credit) || Number(debit) || 0;
                if (amount > 0) {
                    payments.push({
                        id: generateId(),
                        supplierId: supplierId,
                        paymentNumber: row[4] ? String(row[4]) : "Imported",
                        paymentDate: parseDate(dateVal),
                        amount: amount,
                        paymentMode: particulars.includes("CASH") ? 'CASH' : 'BANK_TRANSFER', // Default
                        notes: `Imported Tally: ${vchType} - ${particulars}`,
                        createdAt: new Date().toISOString()
                    });
                }
            }
        }
        i++;
    } else {
        i++;
    }
}

// Calculate supplier balances
suppliers.forEach(s => {
    const sBills = bills.filter(b => b.supplierId === s.id);
    const sPayments = payments.filter(p => p.supplierId === s.id);
    const totalBill = sBills.reduce((sum, b) => sum + b.amount, 0);
    const totalPaid = sPayments.reduce((sum, p) => sum + p.amount, 0);
    s.balance = totalBill - totalPaid;
    // Update bill balances (FIFO logic would be better, but for now leave as is or distribute?)
    // User asked for "payments , bill are handle in the local storage".
    // Simple approach: Mark old bills as paid?
    // Let's simple create the data.
});

log(`Extracted ${suppliers.length} suppliers.`);
log(`Extracted ${bills.length} bills.`);
log(`Extracted ${payments.length} payments.`);

fs.writeFileSync(path.join(OUTPUT_DIR, 'suppliers.json'), JSON.stringify(suppliers, null, 2));
fs.writeFileSync(path.join(OUTPUT_DIR, 'bills.json'), JSON.stringify(bills, null, 2));
fs.writeFileSync(path.join(OUTPUT_DIR, 'payments.json'), JSON.stringify(payments, null, 2));

log("Migration files created.");
logFile.end();
