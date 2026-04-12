import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Dealer, InvoiceItem, Transaction, CompanySettings } from '@/types';

/**
 * Generates an Invoice PDF and returns it as a Base64 string.
 * Supports multiple identical copies.
 */
export const generateInvoicePDFBase64 = async (
    invoice: Transaction,
    dealer: Dealer,
    items: InvoiceItem[] = [],
    company: CompanySettings,
    numCopies: number = 1
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

    // Helper: clip text to fit within a given mm width
    const fitText = (text: string, maxWidthMm: number): string => {
        if (!text) return '';
        if (doc.getTextWidth(text) <= maxWidthMm) return text;
        let t = text;
        while (t.length > 1 && doc.getTextWidth(t) > maxWidthMm) t = t.slice(0, -1);
        return t;
    };

    // Helper: short date format DD/MM/YY
    const shortDate = (dateStr: string): string => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    };

    // --- Helper for drawing everything BUT the items table ---
    const drawPageTemplate = (absolutePageNum: number, totalAbsolutePages: number, startPageOfCopy: number) => {
        const pageNumInCopy = absolutePageNum - startPageOfCopy + 1;
        
        // 1. OUTER BORDER BOX
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(10, 10, 190, 277);

        // Page number at bottom
        const bY = 287;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'italic');
        doc.text(`Page ${absolutePageNum} of ${totalAbsolutePages}`, 195, bY - 2, { align: 'right' });

        // Only draw header info on the FIRST page of each copy
        if (pageNumInCopy > 1) return;

        // 2. HEADER SECTION - Left Side (Company Info)
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(company.companyName.toUpperCase(), 12, 16);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(company.addressLine1 || '', 12, 20);
        doc.text(company.addressLine2 || '', 12, 24);
        doc.text(company.city || '', 12, 28);
        doc.text(`Ph: ${company.phone || 'N/A'}  Email: ${company.email || 'N/A'}`, 12, 32);
        doc.text(`GST NO: ${company.gstNumber || 'N/A'}  PAN NO: ${company.panNumber || 'N/A'}`, 12, 36);

        doc.line(10, 40, 105, 40);

        // Buyer Section
        doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text('Buyer', 12, 45);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(dealer.businessName, 12, 50);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        const dealerAddressLines = doc.splitTextToSize(dealer.address || '', 90);
        let buyerY = 54;
        dealerAddressLines.forEach((line: string) => {
            doc.text(line, 12, buyerY);
            buyerY += 4;
        });
        doc.text(dealer.city || '', 12, buyerY);
        buyerY += 4;
        if (dealer.gstNumber) doc.text(`GST IN: ${dealer.gstNumber}`, 12, buyerY);

        // 3. RIGHT SIDE - INVOICE METADATA TABLE
        const metadataStartX = 105;
        const metadataStartY = 10;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(0);
        doc.rect(metadataStartX, metadataStartY, 95, 8);
        doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text('INVOICE', 152.5, metadataStartY + 5.5, { align: 'center' });

        const rowHeight = 6;
        let mY = metadataStartY + 8;

        // Row 1: Invoice No.
        doc.rect(metadataStartX, mY, 40, rowHeight); doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight); doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text('Invoice No.', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(notes.manualInvoiceNo || invoice.referenceId || '', 23), metadataStartX + 42, mY + 4);
        doc.setFont('helvetica', 'normal'); doc.text('Dated', metadataStartX + 67, mY + 4);
        doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.text(shortDate(invoice.date?.toString() || ''), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 2: Delivery Note
        doc.rect(metadataStartX, mY, 40, rowHeight); doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight); doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text('Delivery Note', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(notes.deliveryNote || '', 23), metadataStartX + 42, mY + 4);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.text('Mode/Terms of', metadataStartX + 66, mY + 3); doc.text('Payment', metadataStartX + 66, mY + 5.5);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(invoice.paymentTerms || 'Immediate', 13), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 3: Supplier's Ref
        doc.rect(metadataStartX, mY, 40, rowHeight); doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight); doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text("Supplier's Ref.", metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(notes.supplierRef || '', 23), metadataStartX + 42, mY + 4);
        doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.text('Other', metadataStartX + 67, mY + 2.5); doc.text('Ref(s)', metadataStartX + 67, mY + 5);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(notes.otherRef || '', 13), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 4: Buyer's Order No
        doc.rect(metadataStartX, mY, 40, rowHeight); doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight); doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text("Buyer's Order No.", metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(notes.buyerOrderNo || '', 23), metadataStartX + 42, mY + 4);
        doc.setFont('helvetica', 'normal'); doc.text('Dated', metadataStartX + 67, mY + 4);
        doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.text(notes.buyerOrderDate ? shortDate(notes.buyerOrderDate) : '', metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 5: Despatch Doc No
        doc.rect(metadataStartX, mY, 40, rowHeight); doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight); doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.text('Despatch Doc No.', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(notes.dispatchDocNo || '', 23), metadataStartX + 42, mY + 4);
        doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.text('Vehicle', metadataStartX + 67, mY + 2.5); doc.text('Number', metadataStartX + 67, mY + 5);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(invoice.vehicleNumber || '', 13), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 6: Despatched through
        doc.rect(metadataStartX, mY, 40, rowHeight); doc.rect(metadataStartX + 40, mY, 25, rowHeight);
        doc.rect(metadataStartX + 65, mY, 15, rowHeight); doc.rect(metadataStartX + 80, mY, 15, rowHeight);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.text('Despatched through', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(invoice.vehicleName || '', 23), metadataStartX + 42, mY + 4);
        doc.setFont('helvetica', 'normal'); doc.text('Destination', metadataStartX + 67, mY + 4);
        doc.setFont('helvetica', 'bold'); doc.text(fitText(invoice.destination || dealer.city || '', 13), metadataStartX + 82, mY + 4);
        mY += rowHeight;

        // Row 7: Terms of Delivery
        doc.rect(metadataStartX, mY, 95, 10);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text('Terms of Delivery', metadataStartX + 2, mY + 4);
        doc.setFont('helvetica', 'bold'); doc.text(notes.termsOfDelivery || '', metadataStartX + 2, mY + 8);

        doc.line(105, 18, 105, mY + 10);
        doc.line(10, mY + 10, 200, mY + 10);
    };

    // Calculations — match exactly the billing UI formula
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const itemDiscounts = items.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
    // itemTax is used ONLY for the HSN/taxable summary table (compliance display)
    // It is NOT added to the grand total — that is intentional design
    const itemTax = items.reduce((sum, i) => sum + (i.cgstAmount + i.sgstAmount + i.igstAmount), 0);
    const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const unit = items[0]?.unit || 'nos';
    const transportCharges = invoice.transportCharges || 0;
    const globalCGST = parseFloat(notes.globalCGST || '0');
    const globalSGST = parseFloat(notes.globalSGST || '0');
    const globalIGST = parseFloat(notes.globalIGST || '0');
    const globalDiscount = parseFloat(notes.globalDiscount || String(invoice.discountPercent || '0'));
    const globalDiscountAmount = (subtotal * globalDiscount) / 100;
    // Global GST: calculated as (subtotal × percent / 100)
    const globalCGSTAmount = (subtotal * globalCGST) / 100;
    const globalSGSTAmount = (subtotal * globalSGST) / 100;
    const globalIGSTAmount = (subtotal * globalIGST) / 100;
    const roundOffAmount = parseFloat(notes.roundOff || '0');
    // Grand total = matches billing UI exactly:
    //   subtotal - itemDiscounts - globalDiscountAmount + globalGST + transport + roundOff
    //   NOTE: per-item itemTax is for HSN/taxable summary ONLY — NOT added to invoice total
    const grandTotal = subtotal
        - itemDiscounts
        - globalDiscountAmount
        + globalCGSTAmount + globalSGSTAmount + globalIGSTAmount
        + transportCharges + roundOffAmount;

    const bodyRows = items.map((item, idx) => [
        (idx + 1).toString(), item.productName, item.hsnCode || '',
        `${(item.cgst + item.sgst + item.igst).toFixed(0)}%`,
        `${item.quantity.toFixed(3)} ${item.unit || 'nos'}`,
        formatRate(item.unitPrice), item.unit || 'nos', '',
        formatAmount(item.unitPrice * item.quantity)
    ]);

    // Metadata height calc
    const HEADER_BOTTOM_Y = 66;
    const buyerAddrLines = doc.splitTextToSize(dealer.address || '', 90);
    const estimatedBuyerBottom = 55 + (buyerAddrLines.length * 4) + 4 + (dealer.gstNumber ? 4 : 0);
    const tableStartY = Math.max(HEADER_BOTTOM_Y, estimatedBuyerBottom + 2);

    for (let i = 0; i < numCopies; i++) {
        if (i > 0) doc.addPage();
        const startPageOfCopy = doc.internal.pages.length - 1;

        autoTable(doc, {
            startY: tableStartY,
            head: [['Sl\nNo.', 'Description of Goods', 'HSN', 'GST', 'Quantity', 'Rate', 'per', 'Disc. %', 'Amount']],
            body: bodyRows,
            theme: 'grid',
            headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.3, lineColor: [0, 0, 0], fontSize: 7, halign: 'center', valign: 'middle' },
            styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [0, 0, 0] },
            columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 60 }, 2: { cellWidth: 15, halign: 'center' }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 18, halign: 'right' }, 6: { cellWidth: 12, halign: 'center' }, 7: { cellWidth: 15, halign: 'center' }, 8: { cellWidth: 30, halign: 'right' } },
            margin: { top: 15, bottom: 60, left: 10, right: 10 },
            foot: [['', 'Total', '', '', `${totalQty.toFixed(3)} ${unit}`, '', '', '', formatAmount(subtotal)]],
            footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.3, lineColor: [0, 0, 0], fontSize: 8, halign: 'right' },
            didDrawPage: (data) => {
                const totalPages = doc.internal.pages.length - 1;
                drawPageTemplate(data.pageNumber, totalPages, startPageOfCopy);
            }
        });

        let currentY = (doc as any).lastAutoTable.finalY + 2;
        if (currentY > 210) { doc.addPage(); currentY = 60; drawPageTemplate(doc.internal.pages.length - 1, doc.internal.pages.length - 1, startPageOfCopy); }

        const drawTotalRow = (label: string, value: string, isGrand = false) => {
            doc.setLineWidth(0.3); doc.rect(10, currentY, 160, 7); doc.rect(170, currentY, 30, 7);
            doc.setFont('helvetica', isGrand ? 'bold' : 'normal'); doc.setFontSize(isGrand ? 9 : 8);
            doc.text(label, 165, currentY + 5, { align: 'right' }); doc.text(value, 198, currentY + 5, { align: 'right' });
            currentY += 7;
        };

        if (transportCharges > 0) drawTotalRow(`Transport Charges (${invoice.vehicleName || 'Vehicle'})`, formatAmount(transportCharges));
        if (itemDiscounts > 0) drawTotalRow('Item Discounts', `- ${formatAmount(itemDiscounts)}`);
        if (globalDiscountAmount > 0) drawTotalRow(`Global Discount (${globalDiscount}%)`, `- ${formatAmount(globalDiscountAmount)}`);
        // Show only global GST (per-item GST goes into HSN summary table but is NOT part of invoice total)
        if (globalCGSTAmount > 0) {
            drawTotalRow(`CGST (${globalCGST}%)`, formatAmount(globalCGSTAmount));
            drawTotalRow(`SGST (${globalSGST}%)`, formatAmount(globalSGSTAmount));
        }
        if (globalIGSTAmount > 0) {
            drawTotalRow(`IGST (${globalIGST}%)`, formatAmount(globalIGSTAmount));
        }
        if (roundOffAmount !== 0) drawTotalRow('Round Off', (roundOffAmount >= 0 ? '+' : '') + formatAmount(roundOffAmount));
        drawTotalRow('Total', formatAmount(grandTotal), true);

        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text('Amount Chargeable (in words)', 12, currentY + 4);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text(`Rs. ${numberToWords(Math.round(grandTotal))}`, 12, currentY + 9);
        currentY += 14; doc.line(10, currentY, 200, currentY);

        const taxSummaryData = Object.values(items.reduce((acc: any, item) => {
            const tr = item.cgst + item.sgst + item.igst;
            const k = `${item.hsnCode || ''}-${tr}`;
            if (!acc[k]) acc[k] = { hsn: item.hsnCode || '', taxable: 0, cgstR: item.cgst, sgstR: item.sgst, totalR: tr, tax: 0 };
            acc[k].taxable += (item.unitPrice * item.quantity);
            acc[k].tax += (item.cgstAmount + item.sgstAmount + item.igstAmount);
            return acc;
        }, {}));

        autoTable(doc, {
            startY: currentY + 2,
            head: [['HSN / SAC', 'Taxable Value', 'CGST %', 'SGST %', 'Total GST %', 'Tax Amount']],
            body: [...taxSummaryData.map((r: any) => [r.hsn, formatAmount(r.taxable), `${r.cgstR}%`, `${r.sgstR}%`, `${r.totalR}%`, formatAmount(r.tax)]), ['Total', formatAmount(subtotal), '', '', '', formatAmount(itemTax)]],
            theme: 'grid',
            headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 7, lineWidth: 0.3, halign: 'center', fontStyle: 'bold' },
            styles: { fontSize: 7, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [0, 0, 0] },
            columnStyles: { 1: { halign: 'right' }, 5: { halign: 'right' } },
            margin: { left: 10, right: 10, bottom: 40, top: 15 },
            didDrawPage: (data) => { drawPageTemplate(data.pageNumber, doc.internal.pages.length - 1, startPageOfCopy); }
        });

        currentY = (doc as any).lastAutoTable.finalY + 5;
        if (currentY > 230) { doc.addPage(); currentY = 60; drawPageTemplate(doc.internal.pages.length - 1, doc.internal.pages.length - 1, startPageOfCopy); }

        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        const bank = [`Account Type: ${company.accountType || 'Current'}`, `Bank: ${company.bankName}`, `A/c No: ${company.accountNumber}`, `IFSC: ${company.ifscCode}`, `Branch: ${company.bankBranch}`];
        bank.forEach((l, idx) => doc.text(l, 12, currentY + (idx * 4)));

        doc.line(10, currentY + 20, 130, currentY + 20);
        doc.setFont('helvetica', 'bold'); doc.text('Declaration', 12, currentY + 24);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
        doc.text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', 12, currentY + 28, { maxWidth: 110 });

        const footerBottom = currentY + 36;
        doc.line(130, currentY - 3, 130, footerBottom);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text(`for ${company.companyName.toUpperCase()}`, 165, currentY + 2, { align: 'center' });
        try { doc.addImage('/signature.png', 'PNG', 148, currentY + 6, 35, 15); } catch { }
        doc.text('Authorised Signatory', 165, currentY + 24, { align: 'center' });
        doc.setLineWidth(0.3); doc.line(10, footerBottom, 200, footerBottom); doc.line(10, currentY - 3, 200, currentY - 3);
        doc.setFontSize(7); doc.setFont('helvetica', 'italic');
        doc.text('This is a Computer Generated Invoice', 105, footerBottom + 4, { align: 'center' });
    }

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

    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.rect(10, 10, 190, 140);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(company.companyName.toUpperCase(), 105, 20, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`${company.addressLine1 || ''}, ${company.addressLine2 || ''}`, 105, 25, { align: 'center' });
    doc.text(`${company.city || ''} - ${company.pinCode || ''}`, 105, 29, { align: 'center' });
    doc.text(`GST NO: ${company.gstNumber || 'N/A'}`, 105, 33, { align: 'center' });
    doc.text(`Ph: ${company.phone || ''} | ${company.email || ''}`, 105, 36, { align: 'center' });
    doc.line(10, 38, 200, 38);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setFillColor(245, 245, 245);
    doc.rect(75, 42, 60, 10, 'F'); doc.rect(75, 42, 60, 10, 'S'); doc.text('PAYMENT RECEIPT', 105, 49, { align: 'center' });

    let rY = 65; doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text('Receipt No:', 15, rY); doc.setFont('helvetica', 'bold'); doc.text(receiptId, 45, rY);
    doc.setFont('helvetica', 'normal'); doc.text('Date:', 140, rY); doc.setFont('helvetica', 'bold'); doc.text(new Date().toLocaleDateString('en-GB'), 160, rY);
    rY += 12; doc.setFont('helvetica', 'normal'); doc.text('Received with thanks from:', 15, rY);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(dealer.businessName, 68, rY);
    rY += 8; doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`${dealer.address || ''}, ${dealer.city || ''}`, 68, rY, { maxWidth: 110 });
    rY += 12; doc.setFontSize(11); doc.text('The sum of Rupees:', 15, rY);
    doc.setFont('helvetica', 'bold'); doc.text(`Rs. ${numberToWords(Math.round(amount))}`, 55, rY, { maxWidth: 130 });
    rY += 12; doc.setFont('helvetica', 'normal'); doc.text('By:', 15, rY);
    doc.setFont('helvetica', 'bold'); doc.text(method, 25, rY);
    doc.setFont('helvetica', 'normal'); doc.text('Amount:', 80, rY);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(`Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 100, rY);
    rY = 130; doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(`Collected by: ${agent}`, 15, rY);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text(`for ${company.companyName.toUpperCase()}`, 155, rY, { align: 'center' });
    doc.line(135, rY + 12, 175, rY + 12); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('Authorised Signatory', 155, rY + 16, { align: 'center' });
    doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.text('This is a computer generated receipt and does not require a physical signature.', 105, 148, { align: 'center' });

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
    const formatCurrencyPDF = (amount: number) => `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.rect(10, 10, 190, 277);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(company.companyName.toUpperCase(), 12, 18);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text((company.addressLine1 || '').toUpperCase(), 12, 24);
    doc.text((company.addressLine2 || '').toUpperCase(), 12, 29);
    doc.text((company.city || '').toUpperCase(), 12, 34);
    doc.setFont('helvetica', 'bold'); doc.text(`GST NO: ${(company.gstNumber || '').toUpperCase()}`, 12, 39);
    doc.line(100, 10, 100, 45); doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('STATEMENT OF ACCOUNT', 150, 25, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 150, 32, { align: 'center' });
    doc.line(10, 45, 200, 45);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('Statement For:', 12, 52);
    doc.setFontSize(11); doc.text(dealer.businessName, 12, 58);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(dealer.address || '', 12, 63, { maxWidth: 85 });
    doc.text(`${dealer.city || ''} | Phone: ${dealer.phone}`, 12, 72);
    doc.setDrawColor(200); doc.setFillColor(245, 245, 245); doc.rect(110, 50, 85, 38, 'F'); doc.rect(110, 50, 85, 38, 'S');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('Account Summary:', 115, 56);
    doc.setFont('helvetica', 'normal'); doc.text('Opening Balance:', 115, 62); doc.text(formatCurrencyPDF(summary.openingBalance || 0), 190, 62, { align: 'right' });
    doc.text('Total Invoiced:', 115, 68); doc.text(formatCurrencyPDF(summary.totalInvoiced), 190, 68, { align: 'right' });
    doc.text('Total Collected:', 115, 74); doc.text(formatCurrencyPDF(summary.totalPaid), 190, 74, { align: 'right' });
    doc.line(115, 77, 190, 77); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38); doc.text('Outstanding:', 115, 83);
    doc.text(formatCurrencyPDF(summary.totalOutstanding) + (summary.totalOutstanding >= 0 ? ' (Cr)' : ' (Dr)'), 190, 83, { align: 'right' });
    doc.setTextColor(0); doc.line(10, 93, 200, 93); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Transaction History', 12, 92);

    const statementEntries = [...invoices.map(inv => ({ date: new Date(inv.date), ref: inv.referenceId, type: inv.referenceId === 'BAL B/F' ? 'Opening Balance' : 'Invoice', amount: inv.amount, paid: inv.paid, balance: inv.balance, notes: inv.originalTransaction?.notes || '', agent: inv.originalTransaction?.agentName || '-', createdAt: inv.originalTransaction?.createdAt })), ...payments.map(p => ({ date: new Date(p.date), ref: p.referenceId, type: 'Receipt', amount: 0, paid: p.amount, balance: 0, agent: p.agentName || 'Admin', notes: (p as any).notes || '', createdAt: (p as any).createdAt }))].sort((a, b) => {
        if (a.ref === 'BAL B/F') return -1; if (b.ref === 'BAL B/F') return 1;
        const dateA = new Date(a.date).getTime(); const dateB = new Date(b.date).getTime(); if (dateA !== dateB) return dateA - dateB;
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0; const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createdA - createdB;
    }).map(entry => {
        if (entry.type === 'Invoice') { const n = (entry as any).notes || ''; if (n.startsWith('Cheque Return') || n.startsWith('Check Return') || n.startsWith('Chq Return')) return { ...entry, type: 'Cheque Return' }; }
        if (entry.type === 'Receipt') { const n = (entry as any).notes || ''; if (n.includes('Stock Return')) return { ...entry, type: 'Stock Return' }; }
        return entry;
    });

    autoTable(doc, {
        startY: 95,
        head: [['Date', 'Ref No', 'Type', 'Credit', 'Debit', 'Agent']],
        body: statementEntries.map(entry => [entry.date.toLocaleDateString('en-GB'), entry.ref, entry.type, (entry.type === 'Invoice' || entry.type === 'Cheque Return' || entry.type === 'Opening Balance') ? formatCurrencyPDF(entry.amount) : '-', (entry.type === 'Receipt' || entry.type === 'Stock Return' || (entry.type === 'Opening Balance' && entry.paid > 0)) ? formatCurrencyPDF(entry.paid) : '-', (entry as any).agent || '-']),
        theme: 'grid', headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 }, styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 }, margin: { left: 10, right: 10 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.text('Note: This is an automatically generated account statement. Please contact us for any discrepancies.', 105, Math.min(finalY, 280), { align: 'center' });
    const pdfOutput = doc.output('datauristring');
    return pdfOutput.split(',')[1];
};

/**
 * Generates a Profit Analysis PDF report and downloads it.
 */
export const generateProfitAnalysisPDF = (
    company: CompanySettings,
    data: {
        periodLabel: string;
        revenue: number;
        cogs: number;
        discounts: number;
        grossProfit: number;
        netProfit: number;
        margin: number;
        agentSalariesTotal: number;
        companyExpensesTotal: number;
        invoiceCount: number;
        dealerBreakdown: any[];
    }
) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const formatCurrencyPDF = (amount: number) => `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Border
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(company.companyName.toUpperCase(), 12, 18);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const headerLines = [
        (company.addressLine1 || '').toUpperCase(),
        (company.addressLine2 || '').toUpperCase(),
        (company.city || '').toUpperCase() + (company.pinCode ? ` - ${company.pinCode}` : ''),
        `GST NO: ${(company.gstNumber || '').toUpperCase()}`
    ];
    headerLines.forEach((line, i) => doc.text(line, 12, 24 + (i * 5)));

    doc.line(105, 10, 105, 45);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PROFIT ANALYSIS REPORT', 152, 22, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${data.periodLabel}`, 152, 30, { align: 'center' });
    doc.text(`Date of Export: ${new Date().toLocaleDateString('en-GB')}`, 152, 36, { align: 'center' });
    doc.line(10, 45, 200, 45);

    // Summary Cards Section
    let currentY = 55;
    doc.setFillColor(245, 245, 250);
    doc.rect(12, currentY, 43, 20, 'F');
    doc.rect(58, currentY, 43, 20, 'F');
    doc.rect(104, currentY, 43, 20, 'F');
    doc.rect(150, currentY, 43, 20, 'F');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('TOTAL REVENUE', 33.5, currentY + 6, { align: 'center' });
    doc.text('COST OF GOODS', 79.5, currentY + 6, { align: 'center' });
    doc.text('GROSS PROFIT', 125.5, currentY + 6, { align: 'center' });
    doc.text('NET PROFIT', 171.5, currentY + 6, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(formatCurrencyPDF(data.revenue), 33.5, currentY + 14, { align: 'center' });
    doc.setTextColor(180, 0, 0);
    doc.text(formatCurrencyPDF(data.cogs), 79.5, currentY + 14, { align: 'center' });
    doc.setTextColor(0, 120, 0);
    doc.text(formatCurrencyPDF(data.grossProfit), 125.5, currentY + 14, { align: 'center' });
    doc.text(formatCurrencyPDF(data.netProfit), 171.5, currentY + 14, { align: 'center' });

    // Breakdown List
    currentY += 30;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Breakdown', 12, currentY);
    doc.line(12, currentY + 2, 60, currentY + 2);
    
    currentY += 10;
    const breakdown = [
        ['Total Sales Revenue', formatCurrencyPDF(data.revenue), 'bold'],
        ['(-) Cost of Goods Sold (COGS)', formatCurrencyPDF(data.cogs), 'normal'],
        ['(-) Agent Salaries', formatCurrencyPDF(data.agentSalariesTotal), 'normal'],
        ['(-) Company Expenses', formatCurrencyPDF(data.companyExpensesTotal), 'normal'],
        ['Company Net Profit', formatCurrencyPDF(data.netProfit), 'bold'],
        ['Profit Margin %', `${data.margin.toFixed(2)}%`, 'bold'],
    ];

    breakdown.forEach(([label, value, style]) => {
        doc.setFont('helvetica', style === 'bold' ? 'bold' : 'normal');
        doc.text(label, 15, currentY);
        doc.text(value, 190, currentY, { align: 'right' });
        doc.line(15, currentY + 2, 190, currentY + 2, 'S');
        currentY += 8;
    });

    // Dealer Breakdown Table
    currentY += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Dealer Performance Summary', 12, currentY);
    
    autoTable(doc, {
        startY: currentY + 5,
        head: [['Dealer Name', 'Bills', 'Revenue', 'COGS', 'Gross Profit', 'Margin %']],
        body: data.dealerBreakdown.map(d => [
            d.name,
            d.count.toString(),
            formatCurrencyPDF(d.revenue),
            formatCurrencyPDF(d.cogs),
            formatCurrencyPDF(d.grossProfit),
            `${((d.grossProfit / (d.revenue || 1)) * 100).toFixed(1)}%`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontSize: 8 },
        styles: { fontSize: 8 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' } },
        margin: { left: 12, right: 12 }
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150);
    doc.text('This is an executive financial summary generated by Sri Vari ERP System.', 105, 280, { align: 'center' });
    doc.text('Confidential - Intellectual Property of Sri Vari Enterprises.', 105, 284, { align: 'center' });

    doc.save(`Profit_Analysis_${data.periodLabel.replace(/\s+/g, '_')}.pdf`);
};

/**
 * Generates an Expense Report PDF and downloads it.
 */
export const generateExpenseReportPDF = (
    expenses: any[],
    company: CompanySettings,
    periodLabel: string
) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const formatCurrencyPDF = (amount: number) => `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Border
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(company.companyName.toUpperCase(), 12, 18);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const headerLines = [
        (company.addressLine1 || '').toUpperCase(),
        (company.addressLine2 || '').toUpperCase(),
        (company.city || '').toUpperCase() + (company.pinCode ? ` - ${company.pinCode}` : ''),
        `GST NO: ${(company.gstNumber || '').toUpperCase()}`
    ];
    headerLines.forEach((line, i) => doc.text(line, 12, 24 + (i * 5)));

    doc.line(100, 10, 100, 45);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('EXPENSE REPORT', 150, 25, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${periodLabel}`, 150, 32, { align: 'center' });
    doc.text(`Date of Export: ${new Date().toLocaleDateString('en-GB')}`, 150, 38, { align: 'center' });
    doc.line(10, 45, 200, 45);

    // Summary Section
    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary:', 12, 53);
    
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(12, 56, 80, 15, 'F');
    doc.rect(12, 56, 80, 15, 'S');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Expenses:', 15, 62);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38);
    doc.text(formatCurrencyPDF(totalAmount), 90, 66, { align: 'right' });
    doc.setTextColor(0);

    // Table
    autoTable(doc, {
        startY: 75,
        head: [['Date', 'Type', 'Description / Manual Name', 'Amount', 'Notes']],
        body: expenses.map(e => [
            new Date(e.date).toLocaleDateString('en-GB'),
            e.expenseType.replace(/_/g, ' '),
            e.customName || '-',
            formatCurrencyPDF(e.amount),
            e.notes || '-'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
        columnStyles: { 3: { halign: 'right' } },
        margin: { left: 10, right: 10 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Note: This is an automatically generated expense report from Sri Vari ERP.', 105, Math.min(finalY, 280), { align: 'center' });

    doc.save(`Expense_Report_${periodLabel.replace(/\s+/g, '_')}.pdf`);
};

/**
 * Generates an Agent Salary Report PDF and downloads it.
 */
export const generateSalaryReportPDF = (
    agents: any[],
    salaries: any[],
    company: CompanySettings,
    opts: { agentId?: string; month?: number; year: number; customLabel?: string }
) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const formatCurrencyPDF = (amount: number) => `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Border
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(company.companyName.toUpperCase(), 12, 18);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const headerLines = [
        (company.addressLine1 || '').toUpperCase(),
        (company.addressLine2 || '').toUpperCase(),
        (company.city || '').toUpperCase() + (company.pinCode ? ` - ${company.pinCode}` : ''),
        `GST NO: ${(company.gstNumber || '').toUpperCase()}`
    ];
    headerLines.forEach((line, i) => doc.text(line, 12, 24 + (i * 5)));

    doc.line(100, 10, 100, 45);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('AGENT SALARY REPORT', 150, 25, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    let periodText = opts.customLabel || (opts.month ? `${monthNames[opts.month - 1]} ${opts.year}` : `Year ${opts.year}`);
    doc.text(`Period: ${periodText}`, 150, 32, { align: 'center' });
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 150, 38, { align: 'center' });
    doc.line(10, 45, 200, 45);

    // Summary Section
    const totalNet = salaries.reduce((sum, s) => sum + s.netSalary, 0);
    const totalBase = salaries.reduce((sum, s) => sum + s.baseSalary, 0);
    const totalExp = salaries.reduce((sum, s) => sum + (s.travelExpense + s.stayExpense + s.foodExpense + s.otherExpense), 0);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Payout Summary:', 12, 53);
    
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(12, 56, 186, 18, 'F');
    doc.rect(12, 56, 186, 18, 'S');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Total base Salary:', 15, 62);
    doc.text('Total Expenses:', 70, 62);
    doc.text('NET PAYABLE:', 130, 62);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrencyPDF(totalBase), 15, 68);
    doc.text(formatCurrencyPDF(totalExp), 70, 68);
    doc.setTextColor(0, 120, 0);
    doc.text(formatCurrencyPDF(totalNet), 130, 68);
    doc.setTextColor(0);

    // Table
    autoTable(doc, {
        startY: 80,
        head: [['Month/Year', 'Agent Name', 'Base Sal', 'Trav/Stay', 'Food/Oth', 'Net Salary', 'Status']],
        body: salaries.map(s => {
            const agent = agents.find(a => a.id === s.agentId);
            return [
                `${monthNames[s.month - 1].slice(0, 3)} ${s.year}`,
                agent?.name || 'Unknown',
                formatCurrencyPDF(s.baseSalary),
                formatCurrencyPDF(s.travelExpense + s.stayExpense),
                formatCurrencyPDF(s.foodExpense + s.otherExpense),
                formatCurrencyPDF(s.netSalary),
                s.paymentStatus
            ];
        }),
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontSize: 8 },
        styles: { fontSize: 8 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        margin: { left: 12, right: 12 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150);
    doc.text('This is an automatically generated salary report from Sri Vari ERP.', 105, 280, { align: 'center' });

    doc.save(`Salary_Report_${periodText.replace(/\s+/g, '_')}.pdf`);
};
