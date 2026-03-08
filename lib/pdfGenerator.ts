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

    // Helper: clip text to fit within a given mm width at the current font/size
    const fitText = (text: string, maxWidthMm: number): string => {
        if (!text) return '';
        if (doc.getTextWidth(text) <= maxWidthMm) return text;
        let t = text;
        while (t.length > 1 && doc.getTextWidth(t) > maxWidthMm) t = t.slice(0, -1);
        return t;
    };

    // Helper: short date format DD/MM/YY to save space in narrow cells
    const shortDate = (dateStr: string): string => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    };

    // --- Helper for drawing everything BUT the items table ---
    const drawPageTemplate = (pageNum: number, totalPages: number) => {
        // 1. OUTER BORDER BOX — drawn on EVERY page
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(10, 10, 190, 277);

        // Page number at bottom of every page
        const bY = 287;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'italic');
        doc.text(`Page ${pageNum} of ${totalPages}`, 195, bY - 2, { align: 'right' });

        // Pages 2+ — just the outer box, no header
        if (pageNum > 1) return;

        // 2. HEADER SECTION - Left Side (Company Info) — page 1 only
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
        let mY = metadataStartY + 8;

        // Row 1: Invoice No.
        doc.rect(metadataStartX, mY, 40, rowHeight);
        doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight);
        doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('Invoice No.', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(notes.manualInvoiceNo || invoice.referenceId || '', 23), metadataStartX + 42, mY + 4);
        doc.setFont('helvetica', 'normal');
        doc.text('Dated', metadataStartX + 67, mY + 4);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text(shortDate(invoice.date?.toString() || ''), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 2: Delivery Note
        doc.rect(metadataStartX, mY, 40, rowHeight);
        doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight);
        doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('Delivery Note', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(notes.deliveryNote || '', 23), metadataStartX + 42, mY + 4);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text('Mode/Terms of', metadataStartX + 66, mY + 3);
        doc.text('Payment', metadataStartX + 66, mY + 5.5);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(invoice.paymentTerms || 'Immediate', 13), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 3: Supplier's Ref
        doc.rect(metadataStartX, mY, 40, rowHeight);
        doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight);
        doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text("Supplier's Ref.", metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(notes.supplierRef || '', 23), metadataStartX + 42, mY + 4);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.text('Other', metadataStartX + 67, mY + 2.5);
        doc.text('Reference(s)', metadataStartX + 67, mY + 5);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(notes.otherRef || '', 13), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 4: Buyer's Order No
        doc.rect(metadataStartX, mY, 40, rowHeight);
        doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight);
        doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text("Buyer's Order No.", metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(notes.buyerOrderNo || '', 23), metadataStartX + 42, mY + 4);
        doc.setFont('helvetica', 'normal');
        doc.text('Dated', metadataStartX + 67, mY + 4);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text(notes.buyerOrderDate ? shortDate(notes.buyerOrderDate) : '', metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 5: Despatch Doc No
        doc.rect(metadataStartX, mY, 40, rowHeight);
        doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight);
        doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text('Despatch Document No.', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(notes.dispatchDocNo || '', 23), metadataStartX + 42, mY + 4);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.text('Vehicle', metadataStartX + 67, mY + 2.5);
        doc.text('Number', metadataStartX + 67, mY + 5);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(invoice.vehicleNumber || '', 13), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 6: Despatched through
        doc.rect(metadataStartX, mY, 40, rowHeight);
        doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight);
        doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text('Despatched through', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(invoice.vehicleName || '', 23), metadataStartX + 42, mY + 4);
        doc.setFont('helvetica', 'normal');
        doc.text('Destination', metadataStartX + 67, mY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(fitText(invoice.destination || dealer.city || '', 13), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 7: Terms of Delivery
        doc.rect(metadataStartX, mY, 95, 10);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('Terms of Delivery', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(notes.termsOfDelivery || '', metadataStartX + 2, mY + 8);

        // Vertical divider for the header
        doc.line(105, 18, 105, mY + 10);
        doc.line(10, mY + 10, 200, mY + 10);
    };

    // Prepare item rows
    const bodyRows = items.map((item, idx) => [
        (idx + 1).toString(),
        item.productName,
        item.hsnCode || '',
        `${(item.cgst + item.sgst + item.igst).toFixed(0)}%`,
        `${item.quantity.toFixed(3)} ${item.unit || 'nos'}`,
        formatRate(item.unitPrice),
        item.unit || 'nos',
        '', // Disc %
        formatAmount(item.unitPrice * item.quantity)
    ]);

    // Initial draw to get total pages if it spans
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const itemCGST = items.reduce((sum, i) => sum + (i.cgstAmount || 0), 0);
    const itemSGST = items.reduce((sum, i) => sum + (i.sgstAmount || 0), 0);
    const itemIGST = items.reduce((sum, i) => sum + (i.igstAmount || 0), 0);
    const totalTax = itemCGST + itemSGST + itemIGST;
    const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const unit = items[0]?.unit || 'nos';
    const transportCharges = invoice.transportCharges || 0;
    const globalCGST = parseFloat(notes.globalCGST || '0');
    const globalSGST = parseFloat(notes.globalSGST || '0');
    const globalIGST = parseFloat(notes.globalIGST || '0');
    const globalCGSTAmount = (subtotal * globalCGST) / 100;
    const globalSGSTAmount = (subtotal * globalSGST) / 100;
    const globalIGSTAmount = (subtotal * globalIGST) / 100;
    const roundOffAmount = parseFloat(notes.roundOff || '0');
    const grandTotal = subtotal + totalTax + transportCharges + roundOffAmount +
        globalCGSTAmount + globalSGSTAmount + globalIGSTAmount;

    // ------------------------------------------------------------------
    // LAYOUT: calculate where buyer section ends so table starts below it
    // Metadata right-side always ends at y≈64 (header 8 + 6 rows×6 + terms 10)
    const HEADER_BOTTOM_Y = 66;
    const buyerAddrLines = doc.splitTextToSize(dealer.address || '', 90);
    const estimatedBuyerBottom = 55 + (buyerAddrLines.length * 4) + 4 + (dealer.gstNumber ? 4 : 0);
    const tableStartY = Math.max(HEADER_BOTTOM_Y, estimatedBuyerBottom + 2);
    // ------------------------------------------------------------------

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
        margin: { top: 15, bottom: 60, left: 10, right: 10 },
        foot: [[
            '',
            'Total',
            '',
            '',
            `${totalQty.toFixed(3)} ${unit}`,
            '',
            '',
            '',
            formatAmount(subtotal)
        ]],
        footStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.3,
            lineColor: [0, 0, 0],
            fontSize: 8,
            halign: 'right'
        },
        didDrawPage: (data) => {
            // Draw header on every page
            const totalPages = (doc as any).internal.getNumberOfPages();
            drawPageTemplate(data.pageNumber, totalPages);
        }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 2;

    // Check if footer can fit on this page, otherwise add page
    if (currentY > 210) {
        doc.addPage();
        currentY = 60;
        const totalPages = (doc as any).internal.getNumberOfPages();
        drawPageTemplate(doc.internal.pages.length - 1, totalPages);
    }

    // --- DRAW TOTALS SECTION ---
    const drawTotalRow = (label: string, value: string, isGrand = false) => {
        doc.setLineWidth(0.3);
        doc.rect(10, currentY, 160, 7);
        doc.rect(170, currentY, 30, 7);
        doc.setFont('helvetica', isGrand ? 'bold' : 'normal');
        doc.setFontSize(isGrand ? 9 : 8);
        doc.text(label, 165, currentY + 5, { align: 'right' });
        doc.text(value, 198, currentY + 5, { align: 'right' });
        currentY += 7;
    };

    if (transportCharges > 0) drawTotalRow(`Transport Charges (${invoice.vehicleName || 'Car'})`, formatAmount(transportCharges));
    if (itemCGST > 0 || globalCGSTAmount > 0) drawTotalRow(`CGST (${globalCGST.toFixed(2)}%)`, formatAmount(itemCGST + globalCGSTAmount));
    if (itemSGST > 0 || globalSGSTAmount > 0) drawTotalRow(`SGST (${globalSGST.toFixed(2)}%)`, formatAmount(itemSGST + globalSGSTAmount));
    if (roundOffAmount !== 0) drawTotalRow('Round Off', (roundOffAmount >= 0 ? '+' : '') + formatAmount(roundOffAmount));
    drawTotalRow('Total', formatAmount(grandTotal), true);

    // --- AMOUNT IN WORDS ---
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Amount Chargeable (in words)', 12, currentY + 4);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${numberToWords(Math.round(grandTotal))}`, 12, currentY + 9);
    currentY += 14;
    doc.line(10, currentY, 200, currentY);

    // --- TAX BREAKDOWN TABLE ---
    const taxSummaryData = Object.values(items.reduce((acc: any, item) => {
        const totalRate = item.cgst + item.sgst + item.igst;
        const key = `${item.hsnCode || ''}-${totalRate}`;
        if (!acc[key]) acc[key] = { hsn: item.hsnCode || '', taxable: 0, cgstR: item.cgst, sgstR: item.sgst, totalR: totalRate, tax: 0 };
        acc[key].taxable += (item.unitPrice * item.quantity);
        acc[key].tax += (item.cgstAmount + item.sgstAmount + item.igstAmount);
        return acc;
    }, {}));

    autoTable(doc, {
        startY: currentY + 2,
        head: [['HSN / SAC', 'Taxable Value', 'CGST %', 'SGST %', 'Total GST %', 'Tax Amount']],
        body: [
            ...taxSummaryData.map((row: any) => [row.hsn, formatAmount(row.taxable), `${row.cgstR}%`, `${row.sgstR}%`, `${row.totalR}%`, formatAmount(row.tax)]),
            ['Total', formatAmount(subtotal), '', '', '', formatAmount(totalTax)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 7, lineWidth: 0.3, halign: 'center', fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [0, 0, 0] },
        columnStyles: { 1: { halign: 'right' }, 5: { halign: 'right' } },
        margin: { left: 10, right: 10, bottom: 40, top: 15 }, // top: 15 = just inside outer border on page 2+
        didDrawPage: (data) => {
            // Ensure outer border + full header appear on every page this table spans
            const totalPages = (doc as any).internal.getNumberOfPages();
            drawPageTemplate(data.pageNumber, totalPages);
        }
    });

    currentY = (doc as any).lastAutoTable.finalY + 5;

    // --- FINAL FOOTER (Bank & Sign) ---
    const fY = currentY;
    if (fY > 230) { doc.addPage(); drawPageTemplate(doc.internal.pages.length - 1, (doc as any).internal.getNumberOfPages()); }

    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    const bankDetails = [
        `Account Type: ${company.accountType || 'Current A/c'}`,
        `Bank: ${company.bankName}`,
        `Account Number: ${company.accountNumber}`,
        `IFSC: ${company.ifscCode}`,
        `Branch: ${company.bankBranch}`
    ];
    bankDetails.forEach((line, i) => doc.text(line, 12, fY + (i * 4)));

    doc.line(10, fY + 20, 130, fY + 20);
    doc.setFont('helvetica', 'bold'); doc.text('Declaration', 12, fY + 24);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    doc.text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', 12, fY + 28, { maxWidth: 110 });

    const footerBottom = fY + 36; // total footer block height
    doc.line(130, fY - 3, 130, footerBottom);   // vertical divider — only content height
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(`for ${company.companyName.toUpperCase()}`, 165, fY + 2, { align: 'center' });
    try { doc.addImage('/signature.png', 'PNG', 148, fY + 6, 35, 15); } catch { }
    doc.text('Authorised Signatory', 165, fY + 24, { align: 'center' });  // just below signature

    // Bottom border to close the footer box
    doc.setLineWidth(0.3);
    doc.line(10, footerBottom, 200, footerBottom);
    doc.line(10, fY - 3, 200, fY - 3);

    // Computer generated footer note
    doc.setFontSize(7); doc.setFont('helvetica', 'italic');
    doc.text('This is a Computer Generated Invoice', 105, footerBottom + 4, { align: 'center' });

    const pdfOutput = doc.output('datauristring');
    return pdfOutput.split(',')[1];
};

/**
 * Generates a Payment Receipt PDF and returns it as a Base64 string.
 */
export const generateReceiptPDFBase64 = async (
    dealer: Dealer,
    amount: number,
    method: string,
    agent: string,
    receiptId: string,
    company: CompanySettings
): Promise<string> => {
    const doc = new jsPDF('p', 'mm', 'a4');

    // Number to words helper (Indian format) - Reusing or re-declaring for self-containment
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
    doc.rect(10, 10, 190, 140); // Half-page sized receipt

    // 2. HEADER SECTION
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(company.companyName.toUpperCase(), 105, 20, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${company.addressLine1 || ''}, ${company.addressLine2 || ''}`, 105, 25, { align: 'center' });
    doc.text(`${company.city || ''} - ${company.pinCode || ''}`, 105, 29, { align: 'center' });
    doc.text(`GST NO: ${company.gstNumber || 'N/A'}`, 105, 33, { align: 'center' });

    doc.setLineWidth(0.3);
    doc.line(10, 38, 200, 38);

    // 3. RECEIPT TITLE
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(245, 245, 245);
    doc.rect(75, 42, 60, 10, 'F');
    doc.rect(75, 42, 60, 10, 'S');
    doc.text('PAYMENT RECEIPT', 105, 49, { align: 'center' });

    // 4. RECEIPT DETAILS
    let rY = 65;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    // Receipt No & Date
    doc.text('Receipt No:', 15, rY);
    doc.setFont('helvetica', 'bold');
    doc.text(receiptId, 45, rY);
    doc.setFont('helvetica', 'normal');
    doc.text('Date:', 140, rY);
    doc.setFont('helvetica', 'bold');
    doc.text(new Date().toLocaleDateString('en-GB'), 160, rY);

    rY += 12;

    // Content
    doc.setFont('helvetica', 'normal');
    doc.text('Received with thanks from:', 15, rY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(dealer.businessName, 68, rY);

    rY += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${dealer.address || ''}, ${dealer.city || ''}`, 68, rY, { maxWidth: 110 });

    rY += 12;

    doc.setFontSize(11);
    doc.text('The sum of Rupees:', 15, rY);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${numberToWords(Math.round(amount))}`, 55, rY, { maxWidth: 130 });

    rY += 12;

    doc.setFont('helvetica', 'normal');
    doc.text('By:', 15, rY);
    doc.setFont('helvetica', 'bold');
    doc.text(method, 25, rY);

    doc.setFont('helvetica', 'normal');
    doc.text('Amount:', 80, rY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 100, rY);

    // 5. FOOTER
    rY = 130;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Collected by: ${agent}`, 15, rY);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`for ${company.companyName.toUpperCase()}`, 155, rY, { align: 'center' });
    doc.setLineWidth(0.2);
    doc.line(135, rY + 12, 175, rY + 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Authorised Signatory', 155, rY + 16, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text('This is a computer generated receipt and does not require a physical signature.', 105, 148, { align: 'center' });

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
    doc.text(company.companyName.toUpperCase(), 12, 18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const addr1 = (company.addressLine1 || '').toUpperCase();
    const addr2 = (company.addressLine2 || '').toUpperCase();
    const city = (company.city || '').toUpperCase();
    const gst = (company.gstNumber || '').toUpperCase();

    doc.text(addr1, 12, 24);
    doc.text(addr2, 12, 29);
    doc.text(city, 12, 34);
    doc.setFont('helvetica', 'bold');
    doc.text(`GST NO: ${gst || 'N/A'}`, 12, 39);

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
    const outstandingStr = formatCurrencyPDF(summary.totalOutstanding);
    const balanceType = summary.totalOutstanding >= 0 ? ' (Cr)' : ' (Dr)';
    doc.text(outstandingStr + balanceType, 190, 76, { align: 'right' });
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
            balance: inv.balance,
            notes: inv.originalTransaction?.notes || '',
            agent: inv.originalTransaction?.agentName || '-',
            createdAt: inv.originalTransaction?.createdAt
        })),
        ...payments.map(p => ({
            date: new Date(p.date),
            ref: p.referenceId,
            type: 'Receipt',
            amount: 0,
            paid: p.amount,
            balance: 0,
            agent: p.agentName || 'Admin',
            notes: (p as any).notes || '',
            createdAt: (p as any).createdAt
        }))
    ].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createdA - createdB;
    })
        .map(entry => {
            // Correctly label Cheque Returns in the type column
            if (entry.type === 'Invoice') {
                const notes = (entry as any).notes || '';
                const isCheckReturn = notes.startsWith('Cheque Return') || notes.startsWith('Check Return') || notes.startsWith('Chq Return');
                if (isCheckReturn) {
                    return { ...entry, type: 'Cheque Return' };
                }
            }
            // Correctly label Stock Returns in the type column
            if (entry.type === 'Receipt') {
                const notes = (entry as any).notes || '';
                const isStockReturn = notes.includes('Stock Return');
                if (isStockReturn) {
                    return { ...entry, type: 'Stock Return' };
                }
            }
            return entry;
        });

    autoTable(doc, {
        startY: 95,
        head: [['Date', 'Ref No', 'Type', 'Credit', 'Debit', 'Agent']],
        body: statementEntries.map(entry => [
            entry.date.toLocaleDateString('en-GB'),
            entry.ref,
            entry.type,
            (entry.type === 'Invoice' || entry.type === 'Cheque Return') ? formatCurrencyPDF(entry.amount) : '-',
            (entry.type === 'Receipt' || entry.type === 'Stock Return') ? formatCurrencyPDF(entry.paid) : '-',
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

/**
 * Generates a Supplier Statement PDF and returns it as a Base64 string.
 */
export const generateSupplierStatementPDFBase64 = async (
    supplier: { name: string; phone?: string; city?: string; balance: number },
    statementData: any[],
    company: CompanySettings
): Promise<string> => {
    const doc = new jsPDF('p', 'mm', 'a4');

    // 1. BOX BORDER
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

    // 2. HEADER SECTION
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(company.companyName.toUpperCase(), 12, 18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const addr1 = (company.addressLine1 || '').toUpperCase();
    const addr2 = (company.addressLine2 || '').toUpperCase();
    const city = (company.city || '').toUpperCase();
    const gst = (company.gstNumber || '').toUpperCase();

    doc.text(addr1, 12, 24);
    doc.text(addr2, 12, 29);
    doc.text(city, 12, 34);
    doc.setFont('helvetica', 'bold');
    doc.text(`GST NO: ${gst || 'N/A'}`, 12, 39);

    // Right Side Header
    doc.line(100, 10, 100, 45);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SUPPLIER STATEMENT', 150, 25, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 150, 32, { align: 'center' });

    doc.line(10, 45, 200, 45);

    // 3. SUPPLIER INFO
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Statement For:', 12, 52);
    doc.setFontSize(11);
    doc.text(supplier.name, 12, 58);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (supplier.phone) doc.text(`Phone: ${supplier.phone}`, 12, 63);
    if (supplier.city) doc.text(`City: ${supplier.city}`, 12, 67);

    // 4. SUMMARY BOX
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(130, 50, 65, 25, 'F');
    doc.rect(130, 50, 65, 25, 'S');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Current Balance:', 135, 58);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    if (supplier.balance > 0) doc.setTextColor(220, 38, 38);
    doc.text(`Rs. ${supplier.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 135, 66);
    doc.setTextColor(0);

    doc.line(10, 80, 200, 80);

    // 5. TRANSACTION TABLE
    const tableColumn = ["Date", "Type", "Reference", "Particulars", "Debit (+)", "Credit (-)", "Balance"];
    const tableRows = statementData.map(entry => [
        new Date(entry.date).toLocaleDateString('en-GB'),
        entry.type === 'BILL' ? 'Pur. Bill' : 'Payment',
        entry.reference,
        entry.notes || '-',
        entry.debit > 0 ? entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-',
        entry.credit > 0 ? entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-',
        entry.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })
    ]);

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 85,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 8 },
        margin: { left: 10, right: 10 }
    });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Note: This is an automatically generated supplier statement.', 105, 280, { align: 'center' });

    const pdfOutput = doc.output('datauristring');
    return pdfOutput.split(',')[1];
};

/**
 * Generates a Whole Company Statement PDF and returns it as a Base64 string.
 */
export const generateWholeCompanyStatementPDFBase64 = async (
    company: CompanySettings,
    transactions: any[],
    dateRangeLabel: string
): Promise<string> => {
    const doc = new jsPDF('p', 'mm', 'a4');

    const formatCurrencyPDF = (amount: number) => {
        return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    };

    // 1. BOX BORDER
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

    // 2. HEADER SECTION
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(company.companyName.toUpperCase(), 12, 18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const addr1 = (company.addressLine1 || '').toUpperCase();
    const addr2 = (company.addressLine2 || '').toUpperCase();
    const city = (company.city || '').toUpperCase();
    const gst = (company.gstNumber || '').toUpperCase();

    doc.text(addr1, 12, 24);
    doc.text(addr2, 12, 29);
    doc.text(city, 12, 34);
    doc.setFont('helvetica', 'bold');
    doc.text(`GST NO: ${gst || 'N/A'}`, 12, 39);

    // Right Side Header
    doc.line(100, 10, 100, 45);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPANY STATEMENT', 150, 25, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(dateRangeLabel, 150, 32, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 150, 36, { align: 'center' });

    doc.line(10, 45, 200, 45);

    // 3. TRANSACTION TABLE
    const tableColumn = ["Date", "Business Name", "Type", "Credit", "Debit"];
    const tableRows = transactions.map(t => [
        new Date(t.date).toLocaleDateString('en-GB'),
        t.businessName || '-',
        t.type || '-',
        t.credit > 0 ? formatCurrencyPDF(t.credit) : '-',
        t.debit > 0 ? formatCurrencyPDF(t.debit) : '-'
    ]);

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 55,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 10, right: 10 }
    });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Note: This is a consolidated company-wide financial statement.', 105, 280, { align: 'center' });

    const pdfOutput = doc.output('datauristring');
    return pdfOutput.split(',')[1];
};
