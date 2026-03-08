import React from 'react';
import { Transaction, Dealer, InvoiceItem, CompanySettings } from '@/types';

interface PrintableInvoiceProps {
    invoice: Transaction;
    dealer: Dealer;
    items: InvoiceItem[];
    company: CompanySettings;
}

const PrintableInvoice: React.FC<PrintableInvoiceProps> = ({ invoice, dealer, items, company }) => {
    // Helper function to format GST rate - handles both decimal (0.09) and percentage (9) formats
    const formatGSTRate = (rate: number): string => {
        // If rate is less than 1, it's likely stored as decimal (0.09 = 9%)
        const percentage = rate < 1 ? rate * 100 : rate;
        // Format with up to 2 decimal places, removing trailing zeros
        return Number(percentage).toFixed(2).replace(/\.?0+$/, '');
    };

    // Parse invoice notes for additional fields
    let notes: any = {};
    try {
        notes = invoice.notes ? JSON.parse(invoice.notes) : {};
    } catch (e) {
        notes = {};
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const totalTax = items.reduce((sum, item) => sum + item.cgstAmount + item.sgstAmount + item.igstAmount, 0);
    const transportCharges = invoice.transportCharges || 0;
    const globalDiscountAmount = (subtotal * (invoice.discountPercent || 0)) / 100;
    const roundOffAmount = parseFloat(notes.roundOff || '0');

    // Global GST
    const globalCGST = parseFloat(notes.globalCGST || '0');
    const globalSGST = parseFloat(notes.globalSGST || '0');
    const globalIGST = parseFloat(notes.globalIGST || '0');

    const globalCGSTAmount = (subtotal * globalCGST) / 100;
    const globalSGSTAmount = (subtotal * globalSGST) / 100;
    const globalIGSTAmount = (subtotal * globalIGST) / 100;

    // Product-level totalTax is for the taxable summary table only — not added to the printed grand total
    const grandTotal = subtotal - globalDiscountAmount +
        globalCGSTAmount + globalSGSTAmount + globalIGSTAmount +
        transportCharges + roundOffAmount;

    // Check if Kerala dealer (IGST) or not (CGST+SGST)
    const isIGST = items.some(item => item.igst > 0);

    // Convert number to words (Indian format)
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

    const cellStyle = "border border-black p-1 text-[9px]";
    const labelStyle = `${cellStyle} bg-white`;
    const valueStyle = `${cellStyle} font-semibold`;

    return (
        <div className="print-invoice bg-white text-black p-[20mm] m-0 font-sans text-[10px] min-h-screen">
            <style>{`
                @media print {
                    @page { margin: 0; size: A4; }
                    body { margin: 0; padding: 0; }
                    .print-invoice { padding: 20mm; margin: 0; width: 210mm; }
                }
                .print-invoice * { box-sizing: border-box; }
                .print-invoice table { border-collapse: collapse; }
            `}</style>

            {/* Main Container with border */}
            <div className="border-2 border-black">

                {/* Top Section: Company+Buyer on LEFT, Invoice Metadata on RIGHT */}
                <div className="flex">
                    {/* Left Column: Company Details + Buyer Details */}
                    <div className="w-[45%] border-r-2 border-black">
                        {/* Company Details */}
                        <div className="p-2 text-[10px] border-b-2 border-black min-h-[90px]">
                            <div className="font-bold text-[11px]">{company.companyName}</div>
                            <div>{company.addressLine1}</div>
                            <div>{company.addressLine2}</div>
                            <div>{company.city}</div>
                            <div>GST NO: {company.gstNumber}</div>
                            <div>PAN NO: {company.panNumber}</div>
                        </div>

                        {/* Buyer Details */}
                        <div className="p-2 text-[10px] min-h-[80px]">
                            <div className="font-bold text-[9px] border-b border-black pb-1 mb-1">Buyer</div>
                            <div className="font-bold text-[11px]">{dealer.businessName}</div>
                            <div>{dealer.address}</div>
                            <div>{dealer.city}</div>
                            {dealer.gstNumber && <div>GST IN: {dealer.gstNumber}</div>}
                        </div>
                    </div>

                    {/* Right Column: Invoice Metadata Grid - 4 columns like Image 1 */}
                    <div className="w-[55%]">
                        {/* INVOICE Header */}
                        <div className="text-center font-bold text-[14px] border-b-2 border-black p-2">INVOICE</div>

                        {/* 4-Column Grid Structure */}
                        <table className="w-full text-[9px]" style={{ tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: '30%' }} />
                                <col style={{ width: '20%' }} />
                                <col style={{ width: '25%' }} />
                                <col style={{ width: '25%' }} />
                            </colgroup>
                            <tbody>
                                {/* Row 1: Invoice No + Dated */}
                                <tr>
                                    <td className={labelStyle}>Invoice No.</td>
                                    <td className={valueStyle}>{notes.manualInvoiceNo || invoice.referenceId}</td>
                                    <td className={labelStyle}>Dated</td>
                                    <td className={valueStyle}>{new Date(invoice.date).toLocaleDateString('en-GB')}</td>
                                </tr>
                                {/* Row 2: Delivery Note + Mode/Terms */}
                                <tr>
                                    <td className={labelStyle}>Delivery Note</td>
                                    <td className={valueStyle}>{notes.deliveryNote || ''}</td>
                                    <td className={labelStyle}>Mode/Terms of Payment</td>
                                    <td className={valueStyle}>{invoice.paymentTerms || 'Immediate'}</td>
                                </tr>
                                {/* Row 3: Supplier's Ref + Other References */}
                                <tr>
                                    <td className={labelStyle}>Supplier's Ref.</td>
                                    <td className={valueStyle}>{notes.supplierRef || ''}</td>
                                    <td className={labelStyle}>Other Reference(s)</td>
                                    <td className={valueStyle}>{notes.otherRef || ''}</td>
                                </tr>
                                {/* Row 4: Buyer's Order No + Dated */}
                                <tr>
                                    <td className={labelStyle}>Buyer's Order No.</td>
                                    <td className={valueStyle}>{notes.buyerOrderNo || ''}</td>
                                    <td className={labelStyle}>Dated</td>
                                    <td className={valueStyle}>{notes.buyerOrderDate ? new Date(notes.buyerOrderDate).toLocaleDateString('en-GB') : ''}</td>
                                </tr>
                                {/* Row 5: Despatch Document No + Vehicle Number */}
                                <tr>
                                    <td className={labelStyle}>Despatch Document No.</td>
                                    <td className={valueStyle}>{notes.dispatchDocNo || ''}</td>
                                    <td className={labelStyle}>Vehicle Number</td>
                                    <td className={valueStyle}>{invoice.vehicleNumber || ''}</td>
                                </tr>
                                {/* Row 6: Despatched through + Destination */}
                                <tr>
                                    <td className={labelStyle}>Despatched through</td>
                                    <td className={valueStyle}>{invoice.vehicleName || ''}</td>
                                    <td className={labelStyle}>Destination</td>
                                    <td className={valueStyle}>{invoice.destination || dealer.city || ''}</td>
                                </tr>
                                {/* Row 7: Terms of Delivery */}
                                <tr>
                                    <td className={labelStyle} colSpan={4}>Terms of Delivery</td>
                                </tr>
                                <tr>
                                    <td className={valueStyle} colSpan={4}>{notes.termsOfDelivery || ''}&nbsp;</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Divider line */}
                <div className="border-t-2 border-black"></div>

                {/* Items Table */}
                <div className="border-b-2 border-black">
                    <table className="w-full text-[9px]">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="border-r border-black p-1 w-8 text-center">Sl<br />No</th>
                                <th className="border-r border-black p-1 text-left">Description of Goods</th>
                                <th className="border-r border-black p-1 w-14 text-center">HSN</th>
                                <th className="border-r border-black p-1 w-10 text-center">GST</th>
                                <th className="border-r border-black p-1 w-16 text-center">Quantity</th>
                                <th className="border-r border-black p-1 w-14 text-center">Rate</th>
                                <th className="border-r border-black p-1 w-10 text-center">per</th>
                                <th className="border-r border-black p-1 w-14 text-center">Disc. %</th>
                                <th className="p-1 w-20 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <React.Fragment key={idx}>
                                    <tr className="border-b border-black">
                                        <td className="border-r border-black p-1 text-center align-top">{idx + 1}</td>
                                        <td className="border-r border-black p-1 align-top font-semibold">{item.productName}</td>
                                        <td className="border-r border-black p-1 text-center align-top">{item.hsnCode}</td>
                                        <td className="border-r border-black p-1 text-center align-top">{(item.cgst + item.sgst + item.igst).toFixed(0)}%</td>
                                        <td className="border-r border-black p-1 text-center align-top font-semibold">{Number(item.quantity).toFixed(3)} {item.unit}</td>
                                        <td className="border-r border-black p-1 text-right align-top">{item.unitPrice.toFixed(2)}</td>
                                        <td className="border-r border-black p-1 text-center align-top">{item.unit}</td>
                                        <td className="border-r border-black p-1 text-center align-top">&nbsp;</td>
                                        <td className="p-1 text-right align-top font-semibold">{(item.unitPrice * item.quantity).toFixed(2)}</td>
                                    </tr>
                                </React.Fragment>
                            ))}
                            {/* Spacer rows to fill table */}
                            {Array.from({ length: Math.max(0, 5 - items.length) }).map((_, i) => (
                                <tr key={`space-${i}`} className="border-b border-black" style={{ height: '24px' }}>
                                    <td className="border-r border-black p-1">&nbsp;</td>
                                    <td className="border-r border-black p-1">&nbsp;</td>
                                    <td className="border-r border-black p-1">&nbsp;</td>
                                    <td className="border-r border-black p-1">&nbsp;</td>
                                    <td className="border-r border-black p-1">&nbsp;</td>
                                    <td className="border-r border-black p-1">&nbsp;</td>
                                    <td className="border-r border-black p-1">&nbsp;</td>
                                    <td className="border-r border-black p-1">&nbsp;</td>
                                    <td className="p-1">&nbsp;</td>
                                </tr>
                            ))}
                            {transportCharges > 0 && (
                                <tr className="border-b border-black">
                                    <td colSpan={8} className="border-r border-black p-1 text-right font-semibold">Transport Charges ({invoice.vehicleName || 'Vehicle'})</td>
                                    <td className="p-1 text-right font-semibold">{transportCharges.toFixed(2)}</td>
                                </tr>
                            )}
                            {/* Global Discount Row */}
                            {globalDiscountAmount > 0 && (
                                <tr className="border-b border-black">
                                    <td colSpan={8} className="border-r border-black p-1 text-right font-semibold">Global Discount ({invoice.discountPercent}%)</td>
                                    <td className="p-1 text-right font-semibold">-{globalDiscountAmount.toFixed(2)}</td>
                                </tr>
                            )}
                            {/* Global GST Rows */}
                            {/* Global GST Rows */}
                            {globalCGSTAmount > 0 && (
                                <tr className="border-b border-black">
                                    <td colSpan={8} className="border-r border-black p-1 text-right font-semibold">CGST ({globalCGST}%)</td>
                                    <td className="p-1 text-right font-semibold">+{globalCGSTAmount.toFixed(2)}</td>
                                </tr>
                            )}
                            {globalSGSTAmount > 0 && (
                                <tr className="border-b border-black">
                                    <td colSpan={8} className="border-r border-black p-1 text-right font-semibold">SGST ({globalSGST}%)</td>
                                    <td className="p-1 text-right font-semibold">+{globalSGSTAmount.toFixed(2)}</td>
                                </tr>
                            )}
                            {globalIGSTAmount > 0 && (
                                <tr className="border-b border-black">
                                    <td colSpan={8} className="border-r border-black p-1 text-right font-semibold">IGST ({globalIGST}%)</td>
                                    <td className="p-1 text-right font-semibold">+{globalIGSTAmount.toFixed(2)}</td>
                                </tr>
                            )}

                            {/* Round Off Row */}
                            {roundOffAmount !== 0 && (
                                <tr className="border-b border-black">
                                    <td colSpan={8} className="border-r border-black p-1 text-right font-semibold">Round Off</td>
                                    <td className="p-1 text-right font-semibold">{roundOffAmount > 0 ? '+' : ''}{roundOffAmount.toFixed(2)}</td>
                                </tr>
                            )}
                            {/* Total Row */}
                            <tr className="border-b-2 border-black font-bold">
                                <td colSpan={4} className="border-r border-black p-1 text-right">Total</td>
                                <td className="border-r border-black p-1 text-center">
                                    {(items.reduce((sum, item) => sum + item.quantity, 0)).toFixed(3)} {items[0]?.unit}
                                </td>
                                <td className="border-r border-black p-1">&nbsp;</td>
                                <td className="border-r border-black p-1">&nbsp;</td>
                                <td className="border-r border-black p-1">&nbsp;</td>
                                <td className="p-1 text-right">{grandTotal.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Amount in Words + Inter State Tax Label */}
                <div className="border-b-2 border-black flex">
                    <div className="w-2/3 border-r-2 border-black p-2">
                        <div className="text-[8px]">Amount Chargeable (in words)</div>
                        <div className="font-bold text-[10px]">Rs. {numberToWords(Math.round(grandTotal))}</div>
                    </div>
                    <div className="w-1/3 p-2 text-center">
                        <div className="font-bold text-[9px]">{isIGST ? 'Inter State Tax' : ''}</div>
                        <div className="text-[8px] italic">E. &amp; O.E</div>
                    </div>
                </div>

                {/* Consolidated Tax Summary Table */}
                <div className="border-b border-black">
                    <table className="w-full text-[9px]">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="border-r border-black p-1 text-center w-[15%]">HSN / SAC</th>
                                <th className="border-r border-black p-1 text-right w-[20%]">Taxable Value</th>
                                <th className="border-r border-black p-1 text-center w-[12%]">CGST %</th>
                                <th className="border-r border-black p-1 text-center w-[12%]">SGST %</th>
                                <th className="border-r border-black p-1 text-center w-[16%]">Total GST %</th>
                                <th className="p-1 text-right w-[25%]">Tax Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.values(items.reduce((acc: any, item) => {
                                const cgstRate = item.cgst;
                                const sgstRate = item.sgst;
                                const totalRate = cgstRate + sgstRate + item.igst;
                                const key = `${item.hsnCode || 'N/A'}-${totalRate.toFixed(2)}`;

                                if (!acc[key]) {
                                    acc[key] = {
                                        hsn: item.hsnCode || 'N/A',
                                        cgstRate: cgstRate,
                                        sgstRate: sgstRate,
                                        totalRate: totalRate,
                                        taxable: 0,
                                        tax: 0
                                    };
                                }

                                acc[key].taxable += (item.unitPrice * item.quantity);
                                acc[key].tax += (item.cgstAmount + item.sgstAmount + item.igstAmount);

                                return acc;
                            }, {})).map((row: any, idx) => (
                                <tr key={idx} className="border-b border-black">
                                    <td className="border-r border-black p-1 text-center">{row.hsn}</td>
                                    <td className="border-r border-black p-1 text-right">{row.taxable.toFixed(2)}</td>
                                    <td className="border-r border-black p-1 text-center">{row.cgstRate.toFixed(2)}%</td>
                                    <td className="border-r border-black p-1 text-center">{row.sgstRate.toFixed(2)}%</td>
                                    <td className="border-r border-black p-1 text-center">{row.totalRate.toFixed(2)}%</td>
                                    <td className="p-1 text-right">{row.tax.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr className="font-bold">
                                <td className="border-r border-black p-1 text-center">Total</td>
                                <td className="border-r border-black p-1 text-right">{subtotal.toFixed(2)}</td>
                                <td className="border-r border-black p-1">&nbsp;</td>
                                <td className="border-r border-black p-1">&nbsp;</td>
                                <td className="border-r border-black p-1">&nbsp;</td>
                                <td className="p-1 text-right">{totalTax.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Bank Details, Declaration & Signature */}
                <div className="flex border-b-2 border-black" style={{ minHeight: '100px' }}>
                    <div className="w-[65%] border-r-2 border-black flex flex-col font-medium">
                        {/* Bank Details */}
                        <div className="p-1 px-2 text-[8px] flex-1">
                            <div className="font-bold text-[9px] text-black mb-[3px]">Bank Details</div>
                            <div className="mb-[2px] font-bold text-black">Account Type: <span className="font-extrabold">{company.accountType || 'Current A/c'}</span></div>
                            <div className="mb-[2px] font-bold text-black">Bank: <span className="font-extrabold">{company.bankName}</span></div>
                            <div className="mb-[2px] font-bold text-black">Account No: <span className="font-extrabold">{company.accountNumber}</span></div>
                            <div className="mb-[2px] font-bold text-black">IFSC: <span className="font-extrabold">{company.ifscCode}</span></div>
                            <div className="mb-[2px] font-bold text-black">Branch: <span className="font-extrabold">{company.bankBranch}</span></div>
                        </div>

                        {/* Declaration */}
                        <div className="border-t border-black p-1 px-2">
                            <div className="font-bold text-[9px] mb-[2px]">Declaration</div>
                            <div className="text-[8px] leading-tight max-w-[400px]">
                                We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                            </div>
                        </div>
                    </div>

                    {/* Signature Section */}
                    <div className="w-[35%] p-2 flex flex-col justify-between items-center relative">
                        <div className="text-center w-full">
                            <div className="text-[9px] font-bold">for {company.companyName}</div>
                        </div>

                        <div className="flex-1 flex items-center justify-center w-full py-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/signature.png" alt="Signature" className="h-14 object-contain" />
                        </div>

                        <div className="text-center w-full">
                            <div className="text-[9px] font-bold">Authorised Signatory</div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center text-[8px] border-t-2 border-black p-1 italic">
                    This is a Computer Generated Invoice
                </div>
            </div>
        </div>
    );
};

export default PrintableInvoice;
