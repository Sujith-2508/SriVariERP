'use client';

import React, { useState, useRef } from 'react';
import { useData } from '@/contexts/DataContext';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';
import { Phone, MapPin, Search, FileText, ArrowRight, X, Download, Calendar, IndianRupee, Clock, Trash2, Building2, MapPinned, AlertTriangle, ChevronLeft, Receipt, User, Printer, Edit, MessageSquare, Check, Loader2 } from 'lucide-react';
import { Transaction, PaymentAllocation, CompanySettings, InvoiceItem, Dealer } from '@/types';
import { calculateDealerStatement, calculateInvoiceProfit, getDealerProfitSummary, formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PrintableInvoice from '@/components/PrintableInvoice';
import { generateStatementPDFBase64 } from '@/lib/pdfGenerator';

// ... existing imports

export default function DealerLedger() {
    const { dealers, transactions, addDealer, updateDealer, deleteDealer, getInvoicePaymentHistory, products } = useData();
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDealerId, setSelectedDealerId] = useState<string | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<Transaction | null>(null);
    const [whatsappSending, setWhatsappSending] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [whatsappError, setWhatsappError] = useState<string | null>(null);

    // Company Settings
    const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);

    // Load Company Settings
    React.useEffect(() => {
        const loadCompanySettings = async () => {
            const { data, error } = await supabase
                .from('company_settings')
                .select('*')
                .single();

            if (!error && data) {
                setCompanySettings({
                    id: data.id,
                    companyName: data.company_name,
                    addressLine1: data.address_line1,
                    addressLine2: data.address_line2,
                    city: data.city,
                    state: data.state,
                    pinCode: data.pin_code,
                    gstNumber: data.gst_number,
                    panNumber: data.pan_number,
                    phone: data.phone,
                    email: data.email,
                    bankName: data.bank_name,
                    bankBranch: data.bank_branch,
                    accountNumber: data.account_number,
                    ifscCode: data.ifsc_code,
                    accountHolderName: data.account_holder_name
                });
            }
        };

        loadCompanySettings();
    }, []);

    const handleDownloadInvoicePDF = async () => {
        if (!selectedInvoice || !selectedDealer) return;

        const jsPDF = (await import('jspdf')).default;
        const autoTable = (await import('jspdf-autotable')).default;

        const doc = new jsPDF();
        const paymentHistory = getInvoicePaymentHistory(selectedInvoice.id);

        // Helper for PDF currency
        const formatCurrencyPDF = (amount: number) => {
            return `Rs. ${amount.toLocaleString('en-IN')}`;
        };

        // Header
        doc.setFontSize(20);
        const companyName = companySettings?.companyName || 'Sri Vari Enterprises';
        doc.text(companyName, 14, 22);

        doc.setFontSize(10);
        doc.text(companySettings?.addressLine1 || '', 14, 28);
        doc.text(`${companySettings?.city || ''}, ${companySettings?.state || ''}`, 14, 32);

        doc.setFontSize(16);
        doc.text('Invoice & Payment History', 14, 45);

        // Invoice Details
        doc.setFontSize(10);
        doc.text(`Invoice No: ${selectedInvoice.referenceId}`, 14, 55);
        doc.text(`Date: ${selectedInvoice.date.toLocaleDateString('en-IN')}`, 14, 60);
        doc.text(`Dealer: ${selectedDealer.businessName}`, 14, 65);
        doc.text(`Contact: ${selectedDealer.phone}`, 14, 70);

        // Invoice Summary
        doc.setDrawColor(200);
        doc.line(14, 75, 196, 75);

        doc.text('Invoice Summary:', 14, 85);
        doc.text(`Amount: ${formatCurrencyPDF(selectedInvoice.amount)}`, 14, 91);
        doc.text(`Paid: ${formatCurrencyPDF(paymentHistory.reduce((acc, p) => acc + p.amount, 0))}`, 80, 91);
        const balance = selectedInvoice.amount - paymentHistory.reduce((acc, p) => acc + p.amount, 0);
        doc.setTextColor(balance > 0 ? 220 : 34, balance > 0 ? 38 : 185, balance > 0 ? 38 : 129);
        doc.text(`Balance: ${formatCurrencyPDF(balance)}`, 140, 91);
        doc.setTextColor(0);

        if (selectedInvoice.dueDate) {
            doc.text(`Due Date: ${new Date(selectedInvoice.dueDate).toLocaleDateString('en-IN')}`, 14, 97);
        }

        // Payment History Table
        if (paymentHistory.length > 0) {
            doc.text('Payment History:', 14, 107);
            autoTable(doc, {
                startY: 112,
                head: [['Receipt No', 'Date', 'Amount', 'Collected By']],
                body: paymentHistory.map(payment => [
                    payment.receiptRef,
                    new Date(payment.date).toLocaleDateString('en-IN'),
                    formatCurrencyPDF(payment.amount),
                    payment.agentName || 'Admin'
                ]),
                theme: 'grid',
                headStyles: { fillColor: [16, 185, 129] }, // Emerald-600
                styles: { fontSize: 9 },
            });

            // Total Paid Footer
            const finalY = (doc as any).lastAutoTable.finalY || 112;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Total Paid:', 14, finalY + 10);
            doc.setTextColor(16, 185, 129);
            doc.text(formatCurrencyPDF(paymentHistory.reduce((acc, p) => acc + p.amount, 0)), 140, finalY + 10, { align: 'right' });
            doc.setTextColor(0);
            doc.setFont('helvetica', 'normal');
        } else {
            doc.text('No payments recorded yet', 14, 112);
        }

        // Footer
        doc.setFontSize(10);
        doc.setTextColor(128);
        doc.text('by Sri Vari Enterprises', 14, 285);
        doc.text('Page 1 of 1', 196, 285, { align: 'right' });

        doc.save(`Invoice_${selectedInvoice.referenceId}_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    // Add Dealer State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newDealer, setNewDealer] = useState({
        businessName: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        district: '',
        pinCode: '',
        gstNumber: ''
    });

    // Edit Dealer State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);
    const [editDealer, setEditDealer] = useState({
        businessName: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        district: '',
        pinCode: '',
        gstNumber: ''
    });

    // Refs for Add Dealer sequential navigation
    const addRefs = [
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLTextAreaElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
    ];
    const { handleKeyDown: handleAddKeyDown } = useEnterKeyNavigation(addRefs);

    // Refs for Edit Dealer sequential navigation
    const editRefs = [
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLTextAreaElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
    ];
    const { handleKeyDown: handleEditKeyDown } = useEnterKeyNavigation(editRefs);



    const handleAddDealer = async (e: React.FormEvent) => {
        e.preventDefault();

        // Phone Number Validation
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(newDealer.phone)) {
            alert('Please enter a valid 10-digit mobile number.');
            return;
        }

        try {
            await addDealer({
                ...newDealer,
                balance: 0
            });
            setIsAddModalOpen(false);
            setNewDealer({
                businessName: '',
                contactPerson: '',
                phone: '',
                email: '',
                address: '',
                city: '',
                district: '',
                pinCode: '',
                gstNumber: ''
            });
        } catch (error) {
            console.error('Error adding dealer:', error);
            alert('Failed to add dealer');
        }
    };

    const handleOpenEditModal = (dealer: Dealer) => {
        setEditingDealer(dealer);
        setEditDealer({
            businessName: dealer.businessName,
            contactPerson: dealer.contactPerson,
            phone: dealer.phone,
            email: '',
            address: dealer.address || '',
            city: dealer.city,
            district: dealer.district,
            pinCode: dealer.pinCode,
            gstNumber: dealer.gstNumber || ''
        });
        setIsEditModalOpen(true);
    };

    const handleEditDealer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingDealer) return;

        // Phone Number Validation
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(editDealer.phone)) {
            alert('Please enter a valid 10-digit mobile number.');
            return;
        }

        try {
            await updateDealer({
                ...editingDealer,
                businessName: editDealer.businessName,
                contactPerson: editDealer.contactPerson,
                phone: editDealer.phone,
                address: editDealer.address,
                city: editDealer.city,
                district: editDealer.district,
                pinCode: editDealer.pinCode,
                gstNumber: editDealer.gstNumber
            });
            setIsEditModalOpen(false);
            setEditingDealer(null);
            setEditDealer({
                businessName: '',
                contactPerson: '',
                phone: '',
                email: '',
                address: '',
                city: '',
                district: '',
                pinCode: '',
                gstNumber: ''
            });
        } catch (error) {
            console.error('Error updating dealer:', error);
            alert('Failed to update dealer');
        }
    };

    const filteredDealers = dealers.filter(d =>
        d.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.district.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedDealer = dealers.find(d => d.id === selectedDealerId);

    // Check if invoice is overdue
    const isOverdue = (dueDate?: Date): boolean => {
        if (!dueDate) return false;
        return new Date() > new Date(dueDate);
    };

    // Calculate days overdue
    const getDaysOverdue = (dueDate?: Date): number => {
        if (!dueDate) return 0;
        const today = new Date();
        const due = new Date(dueDate);
        const diffTime = today.getTime() - due.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
    };

    // Get transactions for selected dealer and calculate FIFO payments
    const getDealerStatement = (dealerId: string) => {
        const dealerTransactions = transactions.filter(t => t.customerId === dealerId);
        return calculateDealerStatement(dealerTransactions);
    };

    const handleExportPDF = async () => {
        const selectedDealer = dealers.find(d => d.id === selectedDealerId);
        if (!selectedDealer) return;

        const jsPDF = (await import('jspdf')).default;
        const autoTable = (await import('jspdf-autotable')).default;

        const doc = new jsPDF();
        const { invoices, payments } = getDealerStatement(selectedDealer.id);
        const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.amount, 0);
        const totalPaid = invoices.reduce((acc, inv) => acc + inv.paid, 0);
        const totalBalance = invoices.reduce((acc, inv) => acc + inv.balance, 0);

        // Helper for PDF currency (native fonts don't match ₹ symbol well without custom font)
        const formatCurrencyPDF = (amount: number) => {
            return `Rs. ${amount.toLocaleString('en-IN')}`;
        };

        // Header
        doc.setFontSize(20);
        const companyName = companySettings?.companyName || 'Sri Vari Enterprises';
        doc.text(companyName, 14, 22);

        doc.setFontSize(10);
        doc.text(companySettings?.addressLine1 || '', 14, 28);
        doc.text(`${companySettings?.city || ''}, ${companySettings?.state || ''}`, 14, 32);

        doc.setFontSize(16);
        doc.text('Dealer Statement', 14, 45);

        // Dealer Details
        doc.setFontSize(10);
        doc.text(`To: ${selectedDealer.businessName}`, 14, 55);
        doc.text(`Contact: ${selectedDealer.contactPerson} (${selectedDealer.phone})`, 14, 60);
        doc.text(`${selectedDealer.city || ''}, ${selectedDealer.district}`, 14, 65);

        // Statement Period
        doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 150, 55);

        // Summary
        doc.setDrawColor(200);
        doc.line(14, 70, 196, 70);

        doc.text('Summary:', 14, 80);
        doc.text(`Total Invoiced: ${formatCurrencyPDF(totalInvoiced)}`, 14, 86);
        doc.text(`Total Paid: ${formatCurrencyPDF(totalPaid)}`, 80, 86);

        doc.setTextColor(220, 38, 38); // Red
        doc.text(`Outstanding Balance: ${formatCurrencyPDF(totalBalance)}`, 140, 86);
        doc.setTextColor(0); // Reset

        // Invoice History Table
        autoTable(doc, {
            startY: 95,
            head: [['Date', 'Ref No', 'Amount', 'Paid', 'Balance', 'Status', 'Due Date']],
            body: invoices.map(inv => [
                inv.date.toLocaleDateString('en-IN'),
                inv.referenceId,
                formatCurrencyPDF(inv.amount),
                formatCurrencyPDF(inv.paid),
                formatCurrencyPDF(inv.balance),
                inv.balance === 0 ? 'Paid' : 'Pending',
                inv.dueDate ? inv.dueDate.toLocaleDateString('en-IN') : '-'
            ]),
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129] }, // Emerald-600
            styles: { fontSize: 9 },
        });

        // Collection History Section
        const collectionY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.text('Collection History', 14, collectionY);

        autoTable(doc, {
            startY: collectionY + 5,
            head: [['Date', 'Receipt No', 'Amount', 'Collected By']],
            body: payments.map(p => [
                new Date(p.date).toLocaleDateString('en-IN'),
                p.referenceId,
                formatCurrencyPDF(p.amount),
                p.agentName || 'Admin'
            ]),
            theme: 'grid',
            headStyles: { fillColor: [5, 150, 105] }, // Emerald-700
            styles: { fontSize: 9 },
        });

        // Current Page count
        const pageCount = (doc as any).internal.getNumberOfPages();

        // Add footer to all pages
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);

            // Footer text
            doc.setFontSize(10);
            doc.setTextColor(128); // Grey
            doc.text('by Sri Vari Enterprises', 14, 285);

            // Page numbers
            doc.setFontSize(8);
            doc.text('Page ' + String(i) + ' of ' + String(pageCount), 196, 285, { align: 'right' });
        }

        doc.save(`${selectedDealer.businessName}_Statement_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const handleSendWhatsAppStatement = async () => {
        const selectedDealer = dealers.find(d => d.id === selectedDealerId);
        if (!selectedDealer || !window.electron?.whatsapp || !companySettings) return;

        setWhatsappSending('sending');
        setWhatsappError(null);

        try {
            const status = await window.electron.whatsapp.getStatus();
            if (status !== 'READY') {
                throw new Error('WhatsApp is not connected. Please go to Settings to link your account.');
            }

            const { invoices, payments, summary } = getDealerStatement(selectedDealer.id);

            const base64Pdf = await generateStatementPDFBase64(
                selectedDealer,
                invoices,
                payments,
                companySettings,
                summary
            );

            await window.electron.whatsapp.sendPDF(
                selectedDealer.phone,
                base64Pdf,
                `${selectedDealer.businessName}_Statement.pdf`,
                `Hello ${selectedDealer.businessName}, please find your account statement as of ${new Date().toLocaleDateString('en-IN')}. Outstanding balance: Rs. ${summary.totalOutstanding.toLocaleString()}.`
            );

            setWhatsappSending('success');
            setTimeout(() => setWhatsappSending('idle'), 5000);
        } catch (err: any) {
            console.error('WhatsApp send failed', err);
            setWhatsappSending('error');
            setWhatsappError(err.message || 'Failed to send WhatsApp message');
        }
    };


    // Invoice Detail View - shows payment history for specific invoice
    if (selectedInvoice && selectedDealer) {
        const paymentHistory = getInvoicePaymentHistory(selectedInvoice.id);
        const { invoices } = getDealerStatement(selectedDealer.id);
        const invoiceData = invoices.find(inv => inv.id === selectedInvoice.id);

        const overdue = invoiceData?.isOverdue && invoiceData.balance > 0;
        const daysOverdue = invoiceData?.dueDate ? getDaysOverdue(new Date(invoiceData.dueDate)) : 0;


        return (
            <div className="h-full overflow-y-auto bg-slate-50">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 p-6 sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSelectedInvoice(null)}
                            className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold text-slate-800">Invoice {selectedInvoice.referenceId}</h1>
                                {overdue && (
                                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center gap-1 animate-pulse">
                                        <AlertTriangle size={12} />
                                        OVERDUE
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-500">{selectedDealer.businessName}</p>
                        </div>
                    </div>
                    <div>
                        <button
                            onClick={handleDownloadInvoicePDF}
                            disabled={!companySettings}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                            <Download size={16} />
                            Download PDF
                        </button>
                    </div>
                </div>

                <div className="p-6 max-w-4xl mx-auto">
                    {/* Overdue Alert */}
                    {overdue && (
                        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6 flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center shrink-0">
                                <AlertTriangle size={24} className="text-white" />
                            </div>
                            <div>
                                <h4 className="font-bold text-red-800">Payment Overdue by {daysOverdue} Days</h4>
                                <p className="text-sm text-red-600">
                                    This invoice was due on {invoiceData?.dueDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
                                    Please follow up with the dealer for collection.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Invoice Details Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                        <div className="bg-slate-800 text-white p-4">
                            <div className="flex items-center gap-2">
                                <FileText size={18} />
                                <h3 className="font-bold">Invoice Details</h3>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-1">Invoice Date</p>
                                    <p className="font-bold text-slate-800">
                                        {new Date(selectedInvoice.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-1">Invoice Amount</p>
                                    <p className="font-bold text-slate-800 text-lg">₹{selectedInvoice.amount.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-1">Credit Days</p>
                                    <p className="font-bold text-slate-800">{selectedInvoice.creditDays || 30} days</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-1">Due Date</p>
                                    <p className={`font-bold ${overdue ? 'text-red-600' : 'text-slate-800'}`}>
                                        {selectedInvoice.dueDate
                                            ? new Date(selectedInvoice.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                            : 'N/A'
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Payment Status Bar */}
                            <div className="mt-6 pt-6 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-slate-600">Payment Progress</span>
                                    <span className="text-sm font-bold text-slate-800">
                                        ₹{invoiceData?.paid.toLocaleString()} / ₹{selectedInvoice.amount.toLocaleString()}
                                    </span>
                                </div>
                                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${invoiceData?.balance === 0 ? 'bg-emerald-500' : overdue ? 'bg-red-500' : 'bg-blue-500'}`}
                                        style={{ width: `${((invoiceData?.paid || 0) / selectedInvoice.amount) * 100}%` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-2">
                                    <span className="text-xs text-emerald-600 font-medium">Paid: ₹{invoiceData?.paid.toLocaleString()}</span>
                                    <span className={`text-xs font-medium ${invoiceData?.balance === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {invoiceData?.balance === 0 ? 'Fully Paid ✓' : `Balance: ₹${invoiceData?.balance.toLocaleString()}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Profit Analysis Card */}
                    {(() => {
                        const profit = calculateInvoiceProfit(selectedInvoice, products);
                        return (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                                <div className="bg-emerald-800 text-white p-4">
                                    <div className="flex items-center gap-2">
                                        <IndianRupee size={18} />
                                        <h3 className="font-bold">Profit Analysis (Admin Only)</h3>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-600">Revenue (Excl. GST)</span>
                                                <span className="font-bold text-slate-800">{formatCurrency(profit.revenue)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-red-600">Cost of Goods (COGS)</span>
                                                <span className="font-bold text-red-600">-{formatCurrency(profit.cogs)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-orange-600">Dealer Discount ({selectedInvoice.discountPercent}%)</span>
                                                <span className="font-bold text-orange-600">-{formatCurrency(profit.dealerDiscount)}</span>
                                            </div>
                                            {profit.serviceCharges > 0 && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-red-600">Transport/Service</span>
                                                    <span className="font-bold text-red-600">-{formatCurrency(profit.serviceCharges)}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col justify-center items-center bg-slate-50 rounded-xl p-4 border border-slate-100">
                                            <p className="text-sm text-slate-500 font-medium mb-1">Net Profit</p>
                                            <p className="text-3xl font-bold text-emerald-600">{formatCurrency(profit.netProfit)}</p>
                                            <div className={`mt-2 px-3 py-1 rounded-full text-xs font-bold ${profit.profitPercentage >= 15 ? 'bg-emerald-100 text-emerald-700' :
                                                profit.profitPercentage >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                {profit.profitPercentage.toFixed(1)}% Margin
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Payment History Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="bg-emerald-600 text-white p-4">
                            <div className="flex items-center gap-2">
                                <Receipt size={18} />
                                <h3 className="font-bold">Payment History</h3>
                            </div>
                            <p className="text-emerald-100 text-sm mt-1">Receipts applied to this invoice (FIFO)</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left p-4 font-semibold text-slate-600">Receipt No</th>
                                        <th className="text-left p-4 font-semibold text-slate-600">Date</th>
                                        <th className="text-right p-4 font-semibold text-slate-600">Amount Applied</th>
                                        <th className="text-left p-4 font-semibold text-slate-600">Collected By</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paymentHistory.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400">
                                                <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                                                No payments recorded for this invoice yet
                                            </td>
                                        </tr>
                                    ) : (
                                        paymentHistory.map((payment, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-4">
                                                    <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                                        {payment.receiptRef}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-slate-700">
                                                    {new Date(payment.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="p-4 text-right font-bold text-emerald-600">
                                                    ₹{payment.amount.toLocaleString()}
                                                </td>
                                                <td className="p-4 text-slate-600 flex items-center gap-2">
                                                    <User size={14} className="text-slate-400" />
                                                    {payment.agentName || 'Admin'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {paymentHistory.length > 0 && (
                                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                        <tr>
                                            <td colSpan={2} className="p-4 font-bold text-slate-700">Total Paid</td>
                                            <td className="p-4 text-right font-bold text-emerald-600 text-lg">
                                                ₹{paymentHistory.reduce((acc, p) => acc + p.amount, 0).toLocaleString()}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* Balance Summary */}
                    <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm text-slate-500">Remaining Balance</p>
                                <p className={`text-3xl font-bold ${invoiceData?.balance === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    ₹{invoiceData?.balance.toLocaleString()}
                                </p>
                            </div>
                            {invoiceData?.balance === 0 && (
                                <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full">
                                    <span className="text-lg">✓</span>
                                    <span className="font-bold">Fully Paid</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>


            </div>
        );
    }

    // Dealer Statement View
    if (selectedDealer) {
        const { invoices, payments } = getDealerStatement(selectedDealer.id);
        const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.amount, 0);
        const totalPaid = invoices.reduce((acc, inv) => acc + inv.paid, 0);
        const totalBalance = invoices.reduce((acc, inv) => acc + inv.balance, 0);
        const overdueCount = invoices.filter(inv => inv.isOverdue && inv.balance > 0).length;

        // Profit Calculation
        const dealerProfitStats = getDealerProfitSummary(
            invoices.map(inv => inv.originalTransaction),
            products
        );

        return (
            <div className="h-full overflow-y-auto bg-slate-50">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 p-6 sticky top-0 z-10">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setSelectedDealerId(null)}
                                className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors"
                            >
                                <X size={18} />
                            </button>
                            <div>
                                <h1 className="text-xl font-bold text-slate-800">{selectedDealer.businessName}</h1>
                                <p className="text-sm text-slate-500">{selectedDealer.contactPerson} • {selectedDealer.phone}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {selectedDealer.city && `${selectedDealer.city}, `}{selectedDealer.district}
                                    {selectedDealer.pinCode && ` - ${selectedDealer.pinCode}`}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {overdueCount > 0 && (
                                <div className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2">
                                    <AlertTriangle size={14} />
                                    {overdueCount} Overdue
                                </div>
                            )}
                            <button
                                onClick={handleExportPDF}
                                className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors">
                                <Download size={16} />
                                Export PDF
                            </button>

                            {/* WhatsApp Button */}
                            <button
                                onClick={handleSendWhatsAppStatement}
                                disabled={whatsappSending === 'sending'}
                                className={`px-4 py-2 rounded-lg border font-medium flex items-center gap-2 transition-all ${whatsappSending === 'success'
                                    ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                                    : whatsappSending === 'error'
                                        ? 'bg-red-50 border-red-500 text-red-600'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                            >
                                {whatsappSending === 'sending' ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : whatsappSending === 'success' ? (
                                    <Check size={16} />
                                ) : (
                                    <MessageSquare size={16} className="text-emerald-500" />
                                )}
                                {whatsappSending === 'sending' ? 'Sending...' :
                                    whatsappSending === 'success' ? 'Sent!' :
                                        whatsappSending === 'error' ? 'Retry' : 'WhatsApp'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Total Invoiced</p>
                            <p className="text-xl font-bold text-slate-800">₹{totalInvoiced.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Total Paid</p>
                            <p className="text-xl font-bold text-emerald-600">₹{totalPaid.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Outstanding Balance</p>
                            <p className="text-xl font-bold text-red-600">₹{totalBalance.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Total Profit</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-xl font-bold text-emerald-600">
                                    {formatCurrency(dealerProfitStats.totalProfit)}
                                </p>
                                <span className="text-xs font-medium text-emerald-500">
                                    ({dealerProfitStats.overallProfitPercentage.toFixed(1)}%)
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* FIFO Explanation */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                        <h4 className="font-semibold text-blue-800 mb-1 flex items-center gap-2">
                            <Clock size={16} />
                            FIFO Payment Logic • Click on any invoice to see payment details
                        </h4>
                        <p className="text-sm text-blue-700">
                            Payments are applied to oldest invoices first. Overdue invoices (past due date) are highlighted in red.
                        </p>
                    </div>

                    {/* Statement Table */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <h3 className="font-semibold text-slate-700">Invoice History (FIFO View)</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="p-4 text-left font-medium">
                                            <div className="flex items-center gap-1">
                                                <Calendar size={14} />
                                                Bill Date
                                            </div>
                                        </th>
                                        <th className="p-4 text-left font-medium">Invoice No</th>
                                        <th className="p-4 text-right font-medium">Amount</th>
                                        <th className="p-4 text-right font-medium">Paid</th>
                                        <th className="p-4 text-right font-medium">Balance</th>
                                        <th className="p-4 text-center font-medium">Credit Days</th>
                                        <th className="p-4 text-center font-medium">Due Date</th>
                                        <th className="p-4 text-right font-medium text-emerald-600">Profit</th>
                                        <th className="p-4 text-center font-medium">Status</th>
                                        <th className="p-4 text-center font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {invoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="p-8 text-center text-slate-400">
                                                No invoices found for this dealer
                                            </td>
                                        </tr>
                                    ) : (
                                        invoices.map((inv) => {
                                            const isOverdueRow = inv.isOverdue && inv.balance > 0;
                                            const daysOverdue = getDaysOverdue(inv.dueDate || undefined);
                                            return (
                                                <tr
                                                    key={inv.id}
                                                    onClick={() => setSelectedInvoice(inv.originalTransaction)}
                                                    className={`cursor-pointer transition-all ${isOverdueRow
                                                        ? 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500'
                                                        : 'hover:bg-slate-50'
                                                        }`}
                                                >
                                                    <td className="p-4 text-slate-700">
                                                        {inv.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`font-mono px-2 py-1 rounded text-xs font-bold ${isOverdueRow ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                            {inv.referenceId}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right font-medium text-slate-800">
                                                        ₹{inv.amount.toLocaleString()}
                                                    </td>
                                                    <td className="p-4 text-right text-emerald-600 font-medium">
                                                        ₹{inv.paid.toLocaleString()}
                                                    </td>
                                                    <td className="p-4 text-right font-bold text-red-600">
                                                        {inv.balance > 0 ? `₹${inv.balance.toLocaleString()}` : '-'}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className="text-slate-600">{inv.creditDays} days</span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`text-sm ${isOverdueRow ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                                                            {inv.dueDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) || 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        {(() => {
                                                            const profit = calculateInvoiceProfit(inv.originalTransaction, products);
                                                            return (
                                                                <div className="flex flex-col items-end">
                                                                    <span className="font-bold text-emerald-600 text-sm">
                                                                        {formatCurrency(profit.netProfit)}
                                                                    </span>
                                                                    <span className="text-xs text-slate-400">
                                                                        {profit.profitPercentage.toFixed(1)}%
                                                                    </span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        {inv.balance === 0 ? (
                                                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                                                                Paid
                                                            </span>
                                                        ) : isOverdueRow ? (
                                                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center justify-center gap-1">
                                                                <AlertTriangle size={10} />
                                                                {daysOverdue}d overdue
                                                            </span>
                                                        ) : inv.paid > 0 ? (
                                                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">
                                                                Partial
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">
                                                                Pending
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                router.push(`/billing?edit=${inv.id}`);
                                                            }}
                                                            className="p-2 hover:bg-slate-200 rounded-full text-slate-500 hover:text-blue-600 transition-colors"
                                                            title="Edit Invoice"
                                                        >
                                                            <FileText size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                            <span className="text-blue-600">💡</span>
                            <span>Click on any invoice row to view detailed payment history</span>
                        </div>
                    </div>

                    {/* Collection History */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <h3 className="font-semibold text-slate-700">Collection History</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="p-4 text-left font-medium">Date</th>
                                        <th className="p-4 text-left font-medium">Receipt No</th>
                                        <th className="p-4 text-right font-medium">Amount</th>
                                        <th className="p-4 text-left font-medium">Collected By</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {payments.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400">
                                                No collections recorded yet
                                            </td>
                                        </tr>
                                    ) : (
                                        payments.map((payment, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-4 text-slate-700">
                                                    {payment.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="p-4">
                                                    <span className="font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded text-xs font-bold">
                                                        {payment.referenceId}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right font-bold text-emerald-600">
                                                    ₹{payment.amount.toLocaleString()}
                                                </td>
                                                <td className="p-4 text-slate-600">
                                                    {payment.agentName || 'Admin'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Statement Footer */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex justify-between items-center">
                            <div className="text-sm text-slate-500">
                                Statement generated on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-slate-500">Net Outstanding</p>
                                <p className="text-2xl font-bold text-red-600">₹{totalBalance.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div >
        );
    }

    // Dealer List View
    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Dealer Ledgers</h1>
                    <p className="text-sm text-slate-500">View dealer statements and payment history</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg"
                    >
                        <User size={16} />
                        Add Dealer
                    </button>
                    <div className="bg-slate-100 px-4 py-2 rounded-lg text-sm text-slate-600 flex items-center">
                        Total Dealers: <strong className="ml-1">{dealers.length}</strong>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md mb-6">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                    id="dealers-search"
                    type="text"
                    placeholder="Search dealers by name, city, district..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Dealer Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDealers.map(d => (
                    <div key={d.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800 leading-tight">{d.businessName}</h3>
                                <p className="text-sm text-slate-500 mt-0.5">{d.contactPerson}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-400 uppercase font-medium">Balance</p>
                                <p className={`font-bold text-lg ${d.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    ₹{d.balance.toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-2">
                                <Building2 size={14} className="text-slate-400" />
                                <span className="truncate">{d.city || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <MapPin size={14} className="text-slate-400" />
                                <span className="truncate">{d.district}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <MapPinned size={14} className="text-slate-400" />
                                <span>PIN: {d.pinCode || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Phone size={14} className="text-slate-400" />
                                <span>{d.phone}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setSelectedDealerId(d.id)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <FileText size={16} />
                            View Statement
                            <ArrowRight size={14} />
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(d);
                            }}
                            className="w-full mt-2 bg-blue-50 hover:bg-blue-100 text-blue-600 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-blue-200"
                        >
                            <Edit size={14} />
                            Edit Dealer
                        </button>

                        {d.balance === 0 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Are you sure you want to delete ${d.businessName}?`)) {
                                        deleteDealer(d.id);
                                    }
                                }}
                                className="w-full mt-2 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-red-200"
                            >
                                <Trash2 size={14} />
                                Delete Dealer
                            </button>
                        )}
                    </div>
                ))}
            </div>


            {/* Add Dealer Modal */}
            {
                isAddModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsAddModalOpen(false)}>
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h2 className="text-xl font-bold text-slate-800">Add New Dealer</h2>
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="text-slate-400 hover:text-slate-600"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                            <form onSubmit={handleAddDealer} className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                                        <input
                                            ref={addRefs[0] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleAddKeyDown(e)}
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.businessName}
                                            onChange={e => setNewDealer({ ...newDealer, businessName: e.target.value })}
                                            placeholder="Enter business name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                                        <input
                                            ref={addRefs[1] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleAddKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.contactPerson}
                                            onChange={e => setNewDealer({ ...newDealer, contactPerson: e.target.value })}
                                            placeholder="Name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                                        <input
                                            ref={addRefs[2] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleAddKeyDown(e)}
                                            type="text"
                                            required
                                            maxLength={10}
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.phone}
                                            onChange={e => setNewDealer({ ...newDealer, phone: e.target.value.replace(/\D/g, '') })}
                                            placeholder="10-digit mobile number"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                        <textarea
                                            ref={addRefs[3] as React.RefObject<HTMLTextAreaElement>}
                                            onKeyDown={(e) => handleAddKeyDown(e as any)}
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            rows={2}
                                            value={newDealer.address}
                                            onChange={e => setNewDealer({ ...newDealer, address: e.target.value })}
                                            placeholder="Street address"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                        <input
                                            ref={addRefs[4] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleAddKeyDown(e)}
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.city}
                                            onChange={e => setNewDealer({ ...newDealer, city: e.target.value })}
                                            placeholder="City"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                                        <input
                                            ref={addRefs[5] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleAddKeyDown(e)}
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.district}
                                            onChange={e => setNewDealer({ ...newDealer, district: e.target.value })}
                                            placeholder="State"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Pin Code</label>
                                        <input
                                            ref={addRefs[6] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleAddKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.pinCode}
                                            onChange={e => setNewDealer({ ...newDealer, pinCode: e.target.value })}
                                            placeholder="6-digit pin code"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
                                        <input
                                            ref={addRefs[7] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleAddKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono"
                                            value={newDealer.gstNumber}
                                            onChange={e => setNewDealer({ ...newDealer, gstNumber: e.target.value.toUpperCase() })}
                                            placeholder="GSTIN"
                                            maxLength={15}
                                        />
                                    </div>
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddModalOpen(false)}
                                        className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                                    >
                                        Add Dealer
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Edit Dealer Modal */}
            {
                isEditModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsEditModalOpen(false)}>
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-blue-50">
                                <h2 className="text-xl font-bold text-slate-800">Edit Dealer</h2>
                                <button
                                    onClick={() => {
                                        setIsEditModalOpen(false);
                                        setEditingDealer(null);
                                    }}
                                    className="text-slate-400 hover:text-slate-600"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                            <form onSubmit={handleEditDealer} className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                                        <input
                                            ref={editRefs[0] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleEditKeyDown(e)}
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={editDealer.businessName}
                                            onChange={e => setEditDealer({ ...editDealer, businessName: e.target.value })}
                                            placeholder="Enter business name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                                        <input
                                            ref={editRefs[1] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleEditKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={editDealer.contactPerson}
                                            onChange={e => setEditDealer({ ...editDealer, contactPerson: e.target.value })}
                                            placeholder="Name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                                        <input
                                            ref={editRefs[2] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleEditKeyDown(e)}
                                            type="text"
                                            required
                                            maxLength={10}
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={editDealer.phone}
                                            onChange={e => setEditDealer({ ...editDealer, phone: e.target.value.replace(/\D/g, '') })}
                                            placeholder="10-digit mobile number"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                        <textarea
                                            ref={editRefs[3] as React.RefObject<HTMLTextAreaElement>}
                                            onKeyDown={(e) => handleEditKeyDown(e as any)}
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            rows={2}
                                            value={editDealer.address}
                                            onChange={e => setEditDealer({ ...editDealer, address: e.target.value })}
                                            placeholder="Street address"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                        <input
                                            ref={editRefs[4] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleEditKeyDown(e)}
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={editDealer.city}
                                            onChange={e => setEditDealer({ ...editDealer, city: e.target.value })}
                                            placeholder="City"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                                        <input
                                            ref={editRefs[5] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleEditKeyDown(e)}
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={editDealer.district}
                                            onChange={e => setEditDealer({ ...editDealer, district: e.target.value })}
                                            placeholder="State"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Pin Code</label>
                                        <input
                                            ref={editRefs[6] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleEditKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={editDealer.pinCode}
                                            onChange={e => setEditDealer({ ...editDealer, pinCode: e.target.value })}
                                            placeholder="6-digit pin code"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
                                        <input
                                            ref={editRefs[7] as React.RefObject<HTMLInputElement>}
                                            onKeyDown={(e) => handleEditKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono"
                                            value={editDealer.gstNumber}
                                            onChange={e => setEditDealer({ ...editDealer, gstNumber: e.target.value.toUpperCase() })}
                                            placeholder="GSTIN"
                                            maxLength={15}
                                        />
                                    </div>
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsEditModalOpen(false);
                                            setEditingDealer(null);
                                        }}
                                        className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                                    >
                                        Update Dealer
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
