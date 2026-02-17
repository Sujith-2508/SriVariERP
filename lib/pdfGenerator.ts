import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Dealer, InvoiceItem, Transaction, CompanySettings } from '@/types';

/**
 * Generates an Invoice PDF and returns it as a Base64 string.
 * This is an absolute, pixel-perfect clone of the user's reference invoice template.
 */
export const generateInvoicePDFBase64 = async (
    invoice: Transaction,
    dealer: Dealer,
    items: InvoiceItem[] = [],
    company: CompanySettings
): Promise<string> => {
    const doc = new jsPDF('p', 'mm', 'a4');

    // Parse notes if they exist as JSON string
    let notes: any = {};
    try {
        notes = invoice.notes ? JSON.parse(invoice.notes) : {};
    } catch (e) {
        notes = {};
    }

    const formatRate = (rate: number) => rate.toFixed(2);
    const formatAmount = (amt: number) => amt.toFixed(2);

    // Number to words helper (Indian format)
    const numberToWords = (num: number): string => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        if (num === 0) return 'Zero';
        const crores = Math.floor(num / 10000000);
        const lakhs = Math.floor((num % 10000000) / 100000);
        const thousands = Math.floor((num % 100000) / 1000);
        const hundreds = Math.floor((num % 1000) / 100);
        const remainder = Math.floor(num % 100);
        let words = '';
        if (crores > 0) words += ones[crores] + ' Crore ';
        if (lakhs > 0) {
            if (lakhs < 10) words += ones[lakhs] + ' Lakh ';
            else if (lakhs < 20) words += teens[lakhs - 10] + ' Lakh ';
            else words += tens[Math.floor(lakhs / 10)] + ' ' + ones[lakhs % 10] + ' Lakh ';
        }
        if (thousands > 0) {
            if (thousands < 10) words += ones[thousands] + ' Thousand ';
            else if (thousands < 20) words += teens[thousands - 10] + ' Thousand ';
            else words += tens[Math.floor(thousands / 10)] + ' ' + ones[thousands % 10] + ' Thousand ';
        }
        if (hundreds > 0) words += ones[hundreds] + ' Hundred ';
        if (remainder > 0) {
            if (remainder < 10) words += ones[remainder];
            else if (remainder < 20) words += teens[remainder - 10];
            else words += tens[Math.floor(remainder / 10)] + ' ' + ones[remainder % 10];
        }
        return words.trim() + ' Only';
    };

    // 1. OUTER BORDER BOX
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

    // 2. HEADER SECTION - Left Side (Company Info)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(company.companyName.toUpperCase(), 12, 16);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(company.addressLine1 || '', 12, 20);
    doc.text(company.addressLine2 || '', 12, 24);
    doc.text(company.city || '', 12, 28);
    doc.text(`GST NO: ${company.gstNumber || 'N/A'}`, 12, 32);
    doc.text(`PAN NO: ${company.panNumber || 'N/A'}`, 12, 36);

    // Horizontal line after company details
    doc.line(10, 40, 105, 40);

    // Buyer Section
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Buyer', 12, 45);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(dealer.businessName, 12, 50);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const dealerAddressLines = doc.splitTextToSize(dealer.address || '', 90);
    let buyerY = 54;
    dealerAddressLines.forEach((line: string) => {
        doc.text(line, 12, buyerY);
        buyerY += 4;
    });
    doc.text(dealer.city || '', 12, buyerY);
    buyerY += 4;
    if (dealer.gstNumber) {
        doc.text(`GST IN: ${dealer.gstNumber}`, 12, buyerY);
    }

    // 3. RIGHT SIDE - INVOICE METADATA TABLE
    const metadataStartX = 105;
    const metadataStartY = 10;

    // Invoice title header
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0);
    doc.rect(metadataStartX, metadataStartY, 95, 8);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 152.5, metadataStartY + 5.5, { align: 'center' });

    // Metadata rows
    const rowHeight = 6;
    let metaY = metadataStartY + 8;

    // Row 1: Invoice No. | Value | Dated | Value
    doc.rect(metadataStartX, metaY, 40, rowHeight);
    doc.rect(metadataStartX + 40, metaY, 25, rowHeight);
    doc.rect(metadataStartX + 65, metaY, 15, rowHeight);
    doc.rect(metadataStartX + 80, metaY, 15, rowHeight);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Invoice No.', metadataStartX + 2, metaY + 4);
    doc.setFont('helvetica', 'bold');
    doc.text(notes.manualInvoiceNo || invoice.referenceId || '', metadataStartX + 42, metaY + 4);
    doc.setFont('helvetica', 'normal');
    doc.text('Dated', metadataStartX + 67, metaY + 4);
    doc.setFont('helvetica', 'bold');
    doc.text(new Date(invoice.date).toLocaleDateString('en-GB'), metadataStartX + 82, metaY + 4);
    metaY += rowHeight;

    // Row 2: Delivery Note | Value | Mode/Terms | Value
    doc.rect(metadataStartX, metaY, 40, rowHeight);
    doc.rect(metadataStartX + 40, metaY, 25, rowHeight);
    doc.rect(metadataStartX + 65, metaY, 15, rowHeight);
    doc.rect(metadataStartX + 80, metaY, 15, rowHeight);

    doc.setFont('helvetica', 'normal');
    doc.text('Delivery Note', metadataStartX + 2, metaY + 4);
    doc.setFontSize(6);
    doc.text('Mode/Terms of', metadataStartX + 66, metaY + 3);
    doc.text('Payment', metadataStartX + 66, metaY + 5.5);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.paymentTerms || 'Immediate', metadataStartX + 82, metaY + 4);
    metaY += rowHeight;

    // Row 3: Supplier's Ref | Value | Other Ref | Value
    doc.rect(metadataStartX, metaY, 40, rowHeight);
    doc.rect(metadataStartX + 40, metaY, 25, rowHeight);
    doc.rect(metadataStartX + 65, metaY, 15, rowHeight);
    doc.rect(metadataStartX + 80, metaY, 15, rowHeight);

    doc.setFont('helvetica', 'normal');
    doc.text("Supplier's Ref.", metadataStartX + 2, metaY + 4);
    doc.setFontSize(6);
    doc.text('Other Reference(s)', metadataStartX + 66, metaY + 4);
    metaY += rowHeight;

    // Row 4: Buyer's Order No | Value | Dated | Value
    doc.setFontSize(7);
    doc.rect(metadataStartX, metaY, 40, rowHeight);
    doc.rect(metadataStartX + 40, metaY, 25, rowHeight);
    doc.rect(metadataStartX + 65, metaY, 15, rowHeight);
    doc.rect(metadataStartX + 80, metaY, 15, rowHeight);

    doc.text("Buyer's Order No.", metadataStartX + 2, metaY + 4);
    doc.text('Dated', metadataStartX + 67, metaY + 4);
    metaY += rowHeight;

    // Row 5: Despatch Document No | Value | Dated | Value
    doc.rect(metadataStartX, metaY, 40, rowHeight);
    doc.rect(metadataStartX + 40, metaY, 25, rowHeight);
    doc.rect(metadataStartX + 65, metaY, 15, rowHeight);
    doc.rect(metadataStartX + 80, metaY, 15, rowHeight);

    doc.setFontSize(6);
    doc.text('Despatch Document No.', metadataStartX + 2, metaY + 4);
    doc.setFontSize(7);
    doc.text('Dated', metadataStartX + 67, metaY + 4);
    metaY += rowHeight;

    // Row 6: Despatched through | Value | Destination | Value
    doc.rect(metadataStartX, metaY, 40, rowHeight);
    doc.rect(metadataStartX + 40, metaY, 25, rowHeight);
    doc.rect(metadataStartX + 65, metaY, 15, rowHeight);
    doc.rect(metadataStartX + 80, metaY, 15, rowHeight);

    doc.setFontSize(6);
    doc.text('Despatched through', metadataStartX + 2, metaY + 4);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(notes.dispatchThrough || invoice.vehicleName || 'Car', metadataStartX + 42, metaY + 4);
    doc.setFont('helvetica', 'normal');
    doc.text('Destination', metadataStartX + 67, metaY + 4);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.destination || dealer.city || 'Pollachi', metadataStartX + 82, metaY + 4);
    metaY += rowHeight;

    // Row 7: Terms of Delivery (full width)
    const termsHeight = 10;
    doc.rect(metadataStartX, metaY, 95, termsHeight);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Terms of Delivery', metadataStartX + 2, metaY + 4);
    metaY += termsHeight;

    // Horizontal line separating header from items table
    doc.line(10, metaY, 200, metaY);

    // 4. ITEMS TABLE
    const tableStartY = metaY;

    // Prepare item rows
    const bodyRows = items.map((item, idx) => [
        (idx + 1).toString(),
        item.productName,
        item.hsnCode || '',
        `${(item.cgst + item.sgst + item.igst).toFixed(0)}%`,
        `${item.quantity} ${item.unit || 'nos'}`,
        formatRate(item.unitPrice),
        item.unit || 'nos',
        '', // Disc %
        formatAmount(item.unitPrice * item.quantity)
    ]);

    autoTable(doc, {
        startY: tableStartY,
        head: [['Sl\nNo.', 'Description of Goods', 'HSN', 'GST', 'Quantity', 'Rate', 'per', 'Disc. %', 'Amount']],
        body: bodyRows,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.3,
            lineColor: [0, 0, 0],
            fontSize: 7,
            halign: 'center',
            valign: 'middle'
        },
        styles: {
            fontSize: 8,
            cellPadding: 2,
            lineColor: [0, 0, 0],
            lineWidth: 0.3,
            textColor: [0, 0, 0]
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 60, fontStyle: 'normal' },
            2: { cellWidth: 15, halign: 'center' },
            3: { cellWidth: 12, halign: 'center' },
            4: { cellWidth: 18, halign: 'center' },
            5: { cellWidth: 18, halign: 'right' },
            6: { cellWidth: 12, halign: 'center' },
            7: { cellWidth: 15, halign: 'center' },
            8: { cellWidth: 30, halign: 'right' }
        },
        margin: { left: 10, right: 10 }
    });

    let currentY = (doc as any).lastAutoTable.finalY;

    // 5. ADDITIONAL CHARGES & TAXES (in table format)
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const unit = items[0]?.unit || 'nos';

    // Transport charges row
    const transportCharges = invoice.transportCharges || 0;
    if (transportCharges > 0) {
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.rect(10, currentY, 160, 6);
        doc.rect(170, currentY, 30, 6);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Transport Charges (${invoice.vehicleName || 'Car'})`, 165, currentY + 4, { align: 'right' });
        doc.text(formatAmount(transportCharges), 198, currentY + 4, { align: 'right' });
        currentY += 6;
    }

    // Tax rows
    const itemCGST = items.reduce((sum, i) => sum + i.cgstAmount, 0);
    const itemSGST = items.reduce((sum, i) => sum + i.sgstAmount, 0);
    const itemIGST = items.reduce((sum, i) => sum + i.igstAmount, 0);

    const globalCGST = parseFloat(notes.globalCGST || '0');
    const globalSGST = parseFloat(notes.globalSGST || '0');
    const globalIGST = parseFloat(notes.globalIGST || '0');
    const globalCGSTAmount = (subtotal * globalCGST) / 100;
    const globalSGSTAmount = (subtotal * globalSGST) / 100;
    const globalIGSTAmount = (subtotal * globalIGST) / 100;

    const drawTaxRow = (label: string, value: number) => {
        doc.rect(10, currentY, 160, 6);
        doc.rect(170, currentY, 30, 6);
        doc.setFont('helvetica', 'normal');
        doc.text(label, 165, currentY + 4, { align: 'right' });
        doc.text(formatAmount(value), 198, currentY + 4, { align: 'right' });
        currentY += 6;
    };

    if (itemCGST > 0 || globalCGSTAmount > 0) {
        const cgstRate = items[0]?.cgst ? items[0].cgst.toFixed(2) : globalCGST.toFixed(2);
        drawTaxRow(`CGST (${cgstRate}%)`, itemCGST + globalCGSTAmount);
    }
    if (itemSGST > 0 || globalSGSTAmount > 0) {
        const sgstRate = items[0]?.sgst ? items[0].sgst.toFixed(2) : globalSGST.toFixed(2);
        drawTaxRow(`SGST (${sgstRate}%)`, itemSGST + globalSGSTAmount);
    }

    // Round off
    const roundOffAmount = parseFloat(notes.roundOff || '0');
    if (roundOffAmount !== 0) {
        doc.rect(10, currentY, 160, 6);
        doc.rect(170, currentY, 30, 6);
        doc.text('Round Off', 165, currentY + 4, { align: 'right' });
        const roundOffText = roundOffAmount >= 0 ? `+${formatAmount(roundOffAmount)}` : formatAmount(roundOffAmount);
        doc.text(roundOffText, 198, currentY + 4, { align: 'right' });
        currentY += 6;
    }

    // Total row
    const totalTax = itemCGST + itemSGST + itemIGST + globalCGSTAmount + globalSGSTAmount + globalIGSTAmount;
    const grandTotal = subtotal + totalTax + transportCharges + roundOffAmount;

    doc.setFillColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.rect(10, currentY, 115, 7);
    doc.rect(125, currentY, 18, 7);
    doc.rect(143, currentY, 27, 7);
    doc.rect(170, currentY, 30, 7);

    doc.setFontSize(9);
    doc.text('Total', 120, currentY + 5, { align: 'right' });
    doc.text(`${totalQty} ${unit}`, 134, currentY + 5, { align: 'center' });
    doc.text(formatAmount(grandTotal), 198, currentY + 5, { align: 'right' });
    currentY += 7;

    // 6. AMOUNT IN WORDS
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Amount Chargeable (in words)', 12, currentY + 4);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const amountInWords = `Rs. ${numberToWords(Math.round(grandTotal))}`;
    doc.text(amountInWords, 12, currentY + 9);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text('E. & O.E', 198, currentY + 4, { align: 'right' });

    currentY += 14;
    doc.line(10, currentY, 200, currentY);

    // 7. TAX BREAKDOWN TABLE
    const taxSummaryData = Object.values(items.reduce((acc: any, item) => {
        const cgstRate = item.cgst;
        const sgstRate = item.sgst;
        const totalRate = cgstRate + sgstRate + item.igst;
        const key = `${item.hsnCode || ''}-${totalRate}`;
        if (!acc[key]) {
            acc[key] = {
                hsn: item.hsnCode || '',
                taxable: 0,
                cgstRate,
                sgstRate,
                totalRate,
                tax: 0
            };
        }
        acc[key].taxable += (item.unitPrice * item.quantity);
        acc[key].tax += (item.cgstAmount + item.sgstAmount + item.igstAmount);
        return acc;
    }, {}));

    autoTable(doc, {
        startY: currentY + 2,
        head: [['HSN / SAC', 'Taxable Value', 'CGST %', 'SGST %', 'Total GST %', 'Tax Amount']],
        body: [
            ...taxSummaryData.map((row: any) => [
                row.hsn,
                formatAmount(row.taxable),
                `${row.cgstRate.toFixed(2)}%`,
                `${row.sgstRate.toFixed(2)}%`,
                `${row.totalRate.toFixed(2)}%`,
                formatAmount(row.tax)
            ]),
            [
                { content: 'Total', styles: { fontStyle: 'bold' } },
                { content: formatAmount(subtotal), styles: { fontStyle: 'bold', halign: 'right' } },
                '',
                '',
                '',
                { content: formatAmount(totalTax), styles: { fontStyle: 'bold', halign: 'right' } }
            ]
        ],
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontSize: 7,
            lineWidth: 0.3,
            halign: 'center',
            fontStyle: 'bold'
        },
        styles: {
            fontSize: 7,
            cellPadding: 1.5,
            lineColor: [0, 0, 0],
            lineWidth: 0.3,
            textColor: [0, 0, 0]
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 30 }, // HSN/SAC
            1: { halign: 'right', cellWidth: 40 },  // Taxable Value
            2: { halign: 'center', cellWidth: 25 }, // CGST %
            3: { halign: 'center', cellWidth: 25 }, // SGST %
            4: { halign: 'center', cellWidth: 30 }, // Total GST %
            5: { halign: 'right', cellWidth: 40 }   // Tax Amount (Total width = 190mm)
        },
        margin: { left: 10, right: 10 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 2;
    // Bank Details, Declaration & Signature
    const footerStartY = (doc as any).lastAutoTable.finalY + 3;
    doc.line(10, footerStartY - 3, 200, footerStartY - 3);

    // Left side - Bank details and declaration
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`Account Type: ${company.accountType || 'Current A/c'}`, 12, footerStartY + 1);
    doc.text(`Bank: ${company.bankName || 'Tamilnad Mercantile Bank (TMB)'}`, 12, footerStartY + 4);
    doc.text(`Account Number: ${company.accountNumber || '090700050900285'}`, 12, footerStartY + 7);
    doc.text(`IFSC: ${company.ifscCode || 'TMBL0000079'}`, 12, footerStartY + 10);
    doc.text(`Branch: ${company.bankBranch || 'Pollachi'}`, 12, footerStartY + 13);

    // Declaration section
    const declarationY = footerStartY + 21;
    doc.line(10, declarationY - 3, 130, declarationY - 3);
    doc.setFont('helvetica', 'bold');
    doc.text('Declaration', 12, declarationY);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    const declarationText = 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';
    const declarationLines = doc.splitTextToSize(declarationText, 110);
    let declY = declarationY + 4;
    declarationLines.forEach((line: string) => {
        doc.text(line, 12, declY);
        declY += 3;
    });

    // Right side - Signature section
    doc.line(130, footerStartY - 3, 130, 287);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`for ${company.companyName.toUpperCase()}`, 165, footerStartY + 2, { align: 'center' });

    // Signature placeholder
    try {
        // Try to add signature image if available
        doc.addImage('/signature.png', 'PNG', 148, footerStartY + 6, 35, 15);
    } catch (e) {
        // If signature not available, just leave space
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Authorised Signatory', 165, 280, { align: 'center' });

    // Bottom note
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.text('This is a Computer Generated Invoice', 105, 285, { align: 'center' });

    const pdfOutput = doc.output('datauristring');
    return pdfOutput.split(',')[1];
};

/**
 * Generates a Dealer Statement PDF and returns it as a Base64 string.
 */
export const generateStatementPDFBase64 = async (
    dealer: Dealer,
    invoices: any[],
    payments: any[],
    company: CompanySettings,
    summary: any
): Promise<string> => {
    const doc = new jsPDF('p', 'mm', 'a4');

    const formatCurrencyPDF = (amount: number) => {
        return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    };

    // 1. BOX BORDER
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

    // 2. PROFESSIONAL HEADER (Aligned with Invoice)
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(company.companyName, 12, 20);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(company.addressLine1 || '', 12, 25);
    doc.text(company.addressLine2 || '', 12, 29);
    doc.text(`${company.city || ''}`, 12, 33);
    doc.text(`GST NO: ${company.gstNumber || 'N/A'}`, 12, 37);

    // Right Side Header
    doc.line(100, 10, 100, 45);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('STATEMENT OF ACCOUNT', 150, 25, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 150, 32, { align: 'center' });

    doc.line(10, 45, 200, 45);

    // 3. DEALER INFO
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Statement For:', 12, 52);
    doc.setFontSize(11);
    doc.text(dealer.businessName, 12, 58);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(dealer.address || '', 12, 63, { maxWidth: 85 });
    doc.text(`${dealer.city || ''} | Phone: ${dealer.phone}`, 12, 72);

    // 4. SUMMARY BOXES
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(110, 50, 85, 30, 'F');
    doc.rect(110, 50, 85, 30, 'S');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Account Summary:', 115, 56);

    doc.setFont('helvetica', 'normal');
    doc.text('Total Invoiced:', 115, 62);
    doc.text(formatCurrencyPDF(summary.totalInvoiced), 190, 62, { align: 'right' });

    doc.text('Total Collected:', 115, 68);
    doc.text(formatCurrencyPDF(summary.totalPaid), 190, 68, { align: 'right' });

    doc.line(115, 71, 190, 71);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38); // Red
    doc.text('Outstanding:', 115, 76);
    doc.text(formatCurrencyPDF(summary.totalOutstanding), 190, 76, { align: 'right' });
    doc.setTextColor(0);

    doc.line(10, 85, 200, 85);

    // 5. COMBINED TRANSACTION HISTORY TABLE
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaction History', 12, 92);

    // Combine and sort invoices and payments
    const statementEntries = [
        ...invoices.map(inv => ({
            date: new Date(inv.date),
            ref: inv.referenceId,
            type: 'Invoice',
            amount: inv.amount,
            paid: inv.paid,
            balance: inv.balance
        })),
        ...payments.map(p => ({
            date: new Date(p.date),
            ref: p.referenceId,
            type: 'Receipt',
            amount: 0,
            paid: p.amount,
            balance: 0,
            agent: p.agentName || 'Admin'
        }))
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    autoTable(doc, {
        startY: 95,
        head: [['Date', 'Ref No', 'Type', 'Invoiced', 'Collected', 'Agent']],
        body: statementEntries.map(entry => [
            entry.date.toLocaleDateString('en-GB'),
            entry.ref,
            entry.type,
            entry.type === 'Invoice' ? formatCurrencyPDF(entry.amount) : '-',
            entry.paid > 0 ? formatCurrencyPDF(entry.paid) : '-',
            (entry as any).agent || '-'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
        margin: { left: 10, right: 10 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Note: This is an automatically generated account statement. Please contact us for any discrepancies.', 105, 280, { align: 'center' });

    const pdfOutput = doc.output('datauristring');
    return pdfOutput.split(',')[1];
};