'use client';

import React, { useState, useRef } from 'react';
import { useData } from '@/contexts/DataContext';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmationContext';
import { Phone, MapPin, Search, FileText, ArrowRight, X, Download, Calendar, IndianRupee, Clock, Trash2, Building2, MapPinned, AlertTriangle, ChevronLeft, Receipt, User, Printer, Edit, MessageSquare, Check, Loader2, CloudUpload, RefreshCw, Eye, ExternalLink } from 'lucide-react';
import { Transaction, PaymentAllocation, CompanySettings, InvoiceItem, Dealer } from '@/types';
import { calculateDealerStatement, calculateInvoiceProfit, getDealerProfitSummary, formatCurrency, getISTDateString } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PrintableInvoice from '@/components/PrintableInvoice';
import { generateStatementPDFBase64 } from '@/lib/pdfGenerator';
import { deleteAllTabsExcept } from '@/lib/googleSheetDealers';
import { uploadToWhatsAppFolder } from '@/lib/googleDriveService';
import { logToApplicationSheet } from '@/lib/googleSheetWriter';

// ... existing imports

export default function DealerLedger() {
    const { dealers, transactions, addDealer, updateDealer, deleteDealer, deleteTransaction, getInvoicePaymentHistory, products, bulkSyncDealers, importDealersFromSheet, importDealersFromTally, deleteDealerWithSheet, syncDealerLedgerToSheet, syncAllDealerTabs, bulkSyncAllDealerLedgers, companySettings } = useData();
    const { showToast } = useToast();
    const { showConfirm } = useConfirm();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isTallyImporting, setIsTallyImporting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDealerId, setSelectedDealerId] = useState<string | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<Transaction | null>(null);
    const [whatsappSending, setWhatsappSending] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [whatsappError, setWhatsappError] = useState<string | null>(null);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [bulkExporting, setBulkExporting] = useState(false);


    // Date range modal state
    const [dateRangeModal, setDateRangeModal] = useState<{
        open: boolean;
        mode: 'export' | 'whatsapp' | 'bulk-export';
        rangeType: 'all' | 'fy-pick' | 'month-pick' | 'custom';
        selectedYear: number;
        selectedMonth: number; // 0-11
        fromDate: string;
        toDate: string;
    }>({
        open: false,
        mode: 'export',
        rangeType: 'all',
        selectedYear: new Date().getFullYear(),
        selectedMonth: new Date().getMonth(),
        fromDate: new Date(new Date().getFullYear(), 0, 1).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        toDate: getISTDateString(),
    });


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
        district: 'Tamil Nadu',
        pinCode: '',
        gstNumber: '',
        openingBalance: '' as number | '',
        openingBalanceDate: getISTDateString()
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
        gstNumber: '',
        openingBalance: '' as number | '',
        openingBalanceDate: getISTDateString()
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
        useRef<HTMLInputElement>(null), // opening balance
        useRef<HTMLInputElement>(null), // opening balance date
    ];
    const { handleKeyDown: handleAddKeyDownBase } = useEnterKeyNavigation(addRefs);
    const [addPhoneError, setAddPhoneError] = useState<string>('');

    // Phone-aware Enter/Arrow handler for Add modal (phone is index 2)
    const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const currentIndex = addRefs.findIndex(ref => ref.current === e.currentTarget);
        if (currentIndex === 2 && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowRight')) {
            const phone = newDealer.phone;
            if (phone.length < 10) {
                e.preventDefault();
                setAddPhoneError('Please fill out this field correctly. Phone number must be 10 digits.');
                (addRefs[2].current as HTMLInputElement | null)?.focus();
                return;
            } else {
                setAddPhoneError('');
            }
        }
        handleAddKeyDownBase(e);
    };

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
        useRef<HTMLInputElement>(null), // opening balance
        useRef<HTMLInputElement>(null), // opening balance date
    ];
    const { handleKeyDown: handleEditKeyDownBase } = useEnterKeyNavigation(editRefs);
    const [editPhoneError, setEditPhoneError] = useState<string>('');

    // Phone-aware Enter/Arrow handler for Edit modal (phone is index 2)
    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const currentIndex = editRefs.findIndex(ref => ref.current === e.currentTarget);
        if (currentIndex === 2 && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowRight')) {
            const phone = editDealer.phone;
            if (phone.length < 10) {
                e.preventDefault();
                setEditPhoneError('Please fill out this field correctly. Phone number must be 10 digits.');
                (editRefs[2].current as HTMLInputElement | null)?.focus();
                return;
            } else {
                setEditPhoneError('');
            }
        }
        handleEditKeyDownBase(e);
    };



    const handleAddDealer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;

        // Phone Number Validation
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(newDealer.phone)) {
            setAddPhoneError('Please fill out this field correctly. Phone number must be 10 digits.');
            (addRefs[2].current as HTMLInputElement | null)?.focus();
            return;
        }
        setAddPhoneError('');

        setIsSaving(true);
        try {
            await addDealer({
                ...newDealer,
                balance: Number(newDealer.openingBalance) || 0,
                openingBalance: Number(newDealer.openingBalance) || 0,
                openingBalanceDate: newDealer.openingBalanceDate
            });
            setIsAddModalOpen(false);
            setNewDealer({
                businessName: '',
                contactPerson: '',
                phone: '',
                email: '',
                address: '',
                city: '',
                district: 'Tamil Nadu',
                pinCode: '',
                gstNumber: '',
                openingBalance: '' as number | '',
                openingBalanceDate: getISTDateString()
            });
            showToast('Dealer added successfully', 'success');
        } catch (error) {
            console.error('Error adding dealer:', error);
            showToast('Failed to add dealer', 'error');
        } finally {
            setIsSaving(false);
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
            gstNumber: dealer.gstNumber || '',
            openingBalance: (dealer.openingBalance === 0 ? '' : dealer.openingBalance) as number | '',
            openingBalanceDate: dealer.openingBalanceDate
                ? (typeof dealer.openingBalanceDate === 'string'
                    ? dealer.openingBalanceDate
                    : dealer.openingBalanceDate.toISOString().split('T')[0])
                : getISTDateString()
        });
        setIsEditModalOpen(true);
    };

    const handleEditDealer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingDealer || isSaving) return;

        // Phone Number Validation
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(editDealer.phone)) {
            setEditPhoneError('Please fill out this field correctly. Phone number must be 10 digits.');
            (editRefs[2].current as HTMLInputElement | null)?.focus();
            return;
        }
        setEditPhoneError('');

        setIsSaving(true);
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
                gstNumber: editDealer.gstNumber,
                openingBalance: Number(editDealer.openingBalance) || 0,
                openingBalanceDate: editDealer.openingBalanceDate,
                balance: (editingDealer.balance - (editingDealer.openingBalance || 0)) + (Number(editDealer.openingBalance) || 0)
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
                gstNumber: '',
                openingBalance: '' as number | '',
                openingBalanceDate: getISTDateString()
            });
            showToast('Dealer updated successfully', 'success');
        } catch (error) {
            console.error('Error updating dealer:', error);
            showToast('Failed to update dealer', 'error');
        } finally {
            setIsSaving(false);
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
        const d = dealers.find(d => d.id === dealerId);
        const dealerTransactions = transactions.filter(t => t.customerId === dealerId);
        return calculateDealerStatement(dealerTransactions, d?.openingBalance || 0, d?.openingBalanceDate);
    };

    // ─── Date range helpers ────────────────────────────────────────────────
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];

    const getDateRange = (): { from: Date; to: Date } | null => {
        const { rangeType, fromDate, toDate, selectedYear, selectedMonth } = dateRangeModal;
        if (rangeType === 'all') return null;
        if (rangeType === 'fy-pick')
            return { from: new Date(selectedYear, 3, 1), to: new Date(selectedYear + 1, 2, 31, 23, 59, 59) };
        if (rangeType === 'month-pick')
            return { from: new Date(selectedYear, selectedMonth, 1), to: new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59) };
        return { from: new Date(fromDate + 'T00:00:00'), to: new Date(toDate + 'T23:59:59') };
    };

    const getPdfLabel = (): string => {
        const { rangeType, selectedYear, selectedMonth, fromDate, toDate } = dateRangeModal;
        if (rangeType === 'all') return 'Complete_Statement';
        if (rangeType === 'fy-pick') return `FY${selectedYear}-${String(selectedYear + 1).slice(-2)}`;
        if (rangeType === 'month-pick') return `${MONTHS[selectedMonth]}_${selectedYear}`;
        const f = new Date(fromDate); const t = new Date(toDate);
        const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}${MONTHS[d.getMonth()].slice(0, 3)}${d.getFullYear()}`;
        return `${fmt(f)}_to_${fmt(t)}`;
    };

    const getWhatsAppRangeText = (): string => {
        const { rangeType, selectedYear, selectedMonth, fromDate, toDate } = dateRangeModal;
        if (rangeType === 'all') return 'complete account statement';
        if (rangeType === 'fy-pick') return `account statement for FY ${selectedYear}-${String(selectedYear + 1).slice(-2)}`;
        if (rangeType === 'month-pick') return `account statement for ${MONTHS[selectedMonth]} ${selectedYear}`;
        const f = new Date(fromDate).toLocaleDateString('en-IN');
        const t = new Date(toDate).toLocaleDateString('en-IN');
        return `account statement from ${f} to ${t}`;
    };

    const filterStatementByRange = (dealerId: string) => {
        const { invoices, payments, summary } = getDealerStatement(dealerId);
        const range = getDateRange();
        if (!range) return { invoices, payments, summary };
        const { from, to } = range;

        const filteredInvoices = invoices.filter(inv => new Date(inv.date) >= from && new Date(inv.date) <= to);
        const filteredPayments = payments.filter(p => new Date(p.date) >= from && new Date(p.date) <= to);

        // For ranged statements, the "Opening Balance" is the dealer's static OB + everything before this range
        const beforeInvoices = invoices.filter(inv => new Date(inv.date) < from);
        const beforePayments = payments.filter(p => new Date(p.date) < from);
        const staticOB = summary.openingBalance || 0;
        
        const periodOpeningBalance = staticOB + 
            beforeInvoices.reduce((s, i) => s + i.amount, 0) - 
            beforePayments.reduce((s, p) => s + p.amount, 0);

        const totalInvoiced = filteredInvoices.reduce((s, inv) => s + inv.amount, 0);
        const totalPaidOnInvoices = filteredInvoices.reduce((s, inv) => s + inv.paid, 0);
        const totalUnapplied = filteredPayments.reduce((s, p) => s + (p.remaining || 0), 0);
        
        const totalOutstanding = periodOpeningBalance + totalInvoiced - (totalPaidOnInvoices + totalUnapplied);

        return {
            invoices: filteredInvoices,
            payments: filteredPayments,
            summary: {
                openingBalance: periodOpeningBalance,
                totalInvoiced,
                totalPaid: totalPaidOnInvoices + totalUnapplied,
                totalOutstanding,
                totalUnapplied,
                overdueCount: filteredInvoices.filter(i => i.isOverdue && i.balance > 0).length
            }
        };
    };

    const openDateModal = (mode: 'export' | 'whatsapp' | 'bulk-export') =>
        setDateRangeModal(prev => ({ ...prev, open: true, mode }));

    const handleExportPDF = async () => {
        setDateRangeModal(prev => ({ ...prev, open: false }));
        const selectedDealer = dealers.find(d => d.id === selectedDealerId);
        if (!selectedDealer) return;

        setExportingPdf(true);
        try {
            const { invoices, payments, summary } = filterStatementByRange(selectedDealer.id);
            const base64Pdf = await generateStatementPDFBase64(
                selectedDealer, invoices, payments, companySettings, summary
            );
            const byteChars = atob(base64Pdf);
            const byteArr = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
            const blob = new Blob([byteArr], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const safeName = selectedDealer.businessName.replace(/[^a-zA-Z0-9]/g, '_');
            link.download = `${safeName}_Statement_${getPdfLabel()}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            console.error('Export PDF failed:', err);
            setExportingPdf(false);
            const errMsg = err?.message || (typeof err === 'string' ? err : 'Unknown error');
            showToast('Failed to generate PDF: ' + errMsg, 'error');
        } finally {
            setExportingPdf(false);
        }
    };

    const handleSendWhatsAppStatement = async () => {
        setDateRangeModal(prev => ({ ...prev, open: false }));
        const selectedDealer = dealers.find(d => d.id === selectedDealerId);
        if (!selectedDealer) return;

        // ── Check WhatsApp connection first ─────────────────────────────────
        if (window.electron?.whatsapp?.getStatus) {
            const status = await window.electron.whatsapp.getStatus();
            if (status !== 'READY') {
                const goToSettings = await showConfirm({
                    title: 'WhatsApp Not Connected',
                    message: 'WhatsApp is not connected. Would you like to go to Settings to connect your WhatsApp account?',
                    confirmLabel: 'Go to Settings',
                    cancelLabel: 'Cancel',
                    type: 'warning'
                });
                if (goToSettings) router.push('/settings');
                return;
            }
        }

        setWhatsappSending('sending');
        setWhatsappError(null);

        try {
            const { invoices, payments, summary } = filterStatementByRange(selectedDealer.id);
            const base64Pdf = await generateStatementPDFBase64(
                selectedDealer, invoices, payments, companySettings, summary
            );
            const safeName = selectedDealer.businessName.replace(/[^a-zA-Z0-9]/g, '_');
            const rangeText = getWhatsAppRangeText();

            if (window.electron?.whatsapp?.sendPDF) {
                await window.electron.whatsapp.sendPDF(
                    selectedDealer.phone,
                    base64Pdf,
                    `${safeName}_Statement_${getPdfLabel()}.pdf`,
                    `Hello ${selectedDealer.businessName}, please find your ${rangeText}. Outstanding balance: Rs. ${summary.totalOutstanding.toLocaleString()}.`
                );
            } else {
                // WEB FALLBACK: check Drive connection first
                const electronAny = window.electron as any;
                const driveConnected = electronAny?.drive
                    ? await electronAny.drive.isConnected()
                    : true; // Web mode: assume connected (uses OAuth flow)

                if (!driveConnected) {
                    const goToDrive = await showConfirm({
                        title: 'Google Drive Not Connected',
                        message: 'Google Drive is not connected. The statement link cannot be generated. Would you like to go to Settings to connect Google Drive?',
                        confirmLabel: 'Go to Settings',
                        cancelLabel: 'Send Text Only',
                        type: 'warning'
                    });
                    if (goToDrive) {
                        router.push('/settings');
                        setWhatsappSending('idle');
                        return;
                    }
                    // User chose "Send Text Only" fallback
                    const message = `Hello ${selectedDealer.businessName}, please find your ${rangeText}. Outstanding balance: Rs. ${summary.totalOutstanding.toLocaleString()}. (Full statement available in office)`;
                    const whatsappUrl = `https://wa.me/${selectedDealer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
                    window.open(whatsappUrl, '_blank');
                } else {
                    try {
                        const stmtLink = await uploadToWhatsAppFolder(base64Pdf, `${safeName}_Statement_${getPdfLabel()}.pdf`);
                        const message = `Hello ${selectedDealer.businessName}, please find your ${rangeText}. Outstanding balance: Rs. ${summary.totalOutstanding.toLocaleString()}. \n\nView Statement PDF: ${stmtLink}`;
                        const whatsappUrl = `https://wa.me/${selectedDealer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
                        window.open(whatsappUrl, '_blank');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } catch (err: any) {
                        console.error('Web WhatsApp share failed:', err);
                        const message = `Hello ${selectedDealer.businessName}, please find your ${rangeText}. Outstanding balance: Rs. ${summary.totalOutstanding.toLocaleString()}.`;
                        const whatsappUrl = `https://wa.me/${selectedDealer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
                        window.open(whatsappUrl, '_blank');
                    }
                }
            }

            setWhatsappSending('success');
            logToApplicationSheet('WhatsApp Statement Sent', `Dealer: ${selectedDealer.businessName}, Range: ${rangeText}, Balance: Rs. ${summary.totalOutstanding.toLocaleString()}`).catch(() => {});
            setTimeout(() => setWhatsappSending('idle'), 5000);
        } catch (err: any) {
            console.error('WhatsApp send failed', err);
            setWhatsappSending('error');
            setWhatsappError(err.message || 'Failed to send WhatsApp message');
        }
    };

    const handleBulkSync = async () => {
        const confirmed = await showConfirm({
            title: 'Bulk Sync Data',
            message: 'This will re-sync ALL dealer data and individual ledgers to Google Sheets. This might take a few minutes. Continue?',
            confirmLabel: 'Sync Now',
            type: 'warning'
        });
        if (!confirmed) return;

        setIsSyncing(true);
        try {
            await bulkSyncDealers();
            showToast('Full sync complete! All data and ledgers are now up-to-date.', 'success');
        } catch (error) {
            console.error('Core sync failed:', error);
            showToast('Failed to sync. Please check your internet connection or Google Sheets connectivity.', 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleImportFromSheet = async () => {
        const confirmed = await showConfirm({
            title: 'Import from Sheets',
            message: 'This will import dealers from Google Sheets. Existing dealers will be updated. Continue?',
            confirmLabel: 'Import'
        });
        if (!confirmed) return;

        setIsImporting(true);
        try {
            const result = await importDealersFromSheet();
            showToast(`Import Complete! Added: ${result.added}, Updated: ${result.updated}`, 'success');
        } catch (error) {
            console.error('Import failed:', error);
            showToast('Failed to import dealers from Google Sheets', 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const handleDeleteTransaction = async (id: string, ref: string, type: 'Invoice' | 'Receipt') => {
        const confirmed = await showConfirm({
            title: `Delete ${type}`,
            message: `Are you sure you want to delete ${type} ${ref}? This will update the dealer balance${type === 'Invoice' ? ' and restore stock' : ''}. This action cannot be undone.`,
            confirmLabel: 'Delete',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await deleteTransaction(id);
                showToast(`${type} deleted successfully`, 'info');
            } catch (err: any) {
                showToast(`Failed to delete ${type}: ${err.message}`, 'error');
            }
        }
    };

    const handleImportFromTally = async () => {
        const confirmed = await showConfirm({
            title: 'Tally Migration',
            message: 'This will parse the "Ledger Vouchers" Tally export to extract ACTUAL dealer names and balances. It will update current balances in Supabase. Continue?',
            confirmLabel: 'Migrate',
            type: 'warning'
        });
        if (!confirmed) return;

        setIsTallyImporting(true);
        try {
            const result = await importDealersFromTally();
            showToast(`Tally Migration Complete! Balanced Data for: ${result.added + result.updated} dealers migrated.`, 'success');
        } catch (error) {
            console.error('Tally migration failed:', error);
            showToast('Failed to import data from Tally Ledger Vouchers', 'error');
        } finally {
            setIsTallyImporting(false);
        }
    };

    const handleBulkExportPDF = async () => {
        setDateRangeModal(prev => ({ ...prev, open: false }));
        setBulkExporting(true);
        try {
            const { PDFDocument } = await import('pdf-lib');
            const sortedDealers = [...dealers].sort((a, b) =>
                a.businessName.localeCompare(b.businessName)
            );
            const company = companySettings;
            const label = getPdfLabel();

            // Create a master merged PDF document
            const mergedPdf = await PDFDocument.create();

            for (const dealer of sortedDealers) {
                const { invoices, payments, summary } = filterStatementByRange(dealer.id);
                // Generate the same professional statement PDF as individual export
                const base64 = await generateStatementPDFBase64(
                    dealer, invoices, payments, company, summary
                );
                // Load into pdf-lib and copy all pages into the merged doc
                const pdfBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                const dealerPdf = await PDFDocument.load(pdfBytes);
                const pageIndices = dealerPdf.getPageIndices();
                const copiedPages = await mergedPdf.copyPages(dealerPdf, pageIndices);
                copiedPages.forEach((page: any) => mergedPdf.addPage(page));
            }

            const mergedBytes = await mergedPdf.save();
            const blob = new Blob([new Uint8Array(mergedBytes)], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `All_Dealers_Statement_${label}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            console.error('Bulk Export PDF failed:', err);
            const errMsg = err?.message || (typeof err === 'string' ? err : 'Unknown error');
            showToast('Failed to generate bulk PDF: ' + errMsg, 'error');
        } finally {
            setBulkExporting(false);
        }
    };

    // --- MAIN CONTENT SELECTION ---
    let mainContent = null;

    // Invoice Detail View - shows payment history for specific invoice
    if (selectedInvoice && selectedDealer) {
        const paymentHistory = getInvoicePaymentHistory(selectedInvoice.id);
        const { invoices } = getDealerStatement(selectedDealer.id);
        const invoiceData = invoices.find(inv => inv.id === selectedInvoice.id);

        const overdue = invoiceData?.isOverdue && invoiceData.balance > 0;
        const daysOverdue = invoiceData?.dueDate ? getDaysOverdue(new Date(invoiceData.dueDate)) : 0;


        mainContent = (
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
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
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
            </div >
        );
    }

    // Dealer Statement View
    if (selectedDealer && !mainContent) {
        const { invoices, payments, summary } = getDealerStatement(selectedDealer.id);
        const { totalInvoiced, totalPaid, totalOutstanding: totalBalance, overdueCount } = summary;

        // Profit Calculation
        const dealerProfitStats = getDealerProfitSummary(
            invoices.map(inv => inv.originalTransaction),
            products
        );

        // Combine and sort invoices and payments for statement generation
        let runningBalance = 0;
        const statementEntries = [
            ...invoices.map(inv => ({
                date: inv.date,
                reference: inv.referenceId,
                type: inv.referenceId === 'BAL B/F' ? 'Opening Balance' : 'Invoice',
                // BUG FIX: BAL B/F debit must be inv.amount (e.g. ₹50,000) NOT 0.
                // Previously set to 0, which meant the opening balance never
                // contributed to the running balance, making all totals wrong.
                debit: inv.amount,
                credit: 0,
                balance: 0,
                originalTransaction: inv.originalTransaction
            })),
            ...payments.map(pay => ({
                date: pay.date,
                reference: pay.referenceId,
                type: 'Payment',
                debit: 0,
                credit: pay.amount,
                balance: 0,
                originalTransaction: pay.originalTransaction
            }))
        ]
        .sort((a, b) => {
            // BAL B/F (opening balance) is ALWAYS first
            if (a.reference === 'BAL B/F') return -1;
            if (b.reference === 'BAL B/F') return 1;

            // All other entries: strict chronological order
            const diff = a.date.getTime() - b.date.getTime();
            if (diff !== 0) return diff;

            // Same date: invoices before payments (logical ordering)
            if (a.type === 'Invoice' && b.type === 'Payment') return -1;
            if (a.type === 'Payment' && b.type === 'Invoice') return 1;
            return 0;
        })
        .map((entry, idx) => {
            if (idx === 0) {
                runningBalance = entry.debit - entry.credit;
                entry.balance = runningBalance;
            } else {
                runningBalance += entry.debit - entry.credit;
                entry.balance = runningBalance;
            }
            return entry;
        });

        mainContent = (
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
                                onClick={() => openDateModal('export')}
                                disabled={exportingPdf}
                                className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-60">
                                {exportingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                {exportingPdf ? 'Generating...' : 'Export PDF'}
                            </button>

                            {/* WhatsApp Button */}
                            <button
                                onClick={() => openDateModal('whatsapp')}
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
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Opening Balance</p>
                            <p className="text-xl font-bold text-slate-800">₹{(summary.openingBalance || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Invoiced</p>
                            <p className="text-xl font-bold text-slate-800">₹{totalInvoiced.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Total Paid</p>
                            <p className="text-xl font-bold text-emerald-600">₹{totalPaid.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Net Outstanding</p>
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

                    {/* Unified Ledger Account Table */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
                        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-slate-700">Ledger Account</h3>
                                <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100 uppercase tracking-wider">
                                    <Clock size={10} />
                                    FIFO Consolidated
                                </div>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium italic">Dr = Receivable (Sale/OB) | Cr = Received (Receipt)</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="p-4 text-left font-medium w-32">Date</th>
                                        <th className="p-4 text-left font-medium">Particulars</th>
                                        <th className="p-4 text-left font-medium w-32">Vch Type</th>
                                        <th className="p-4 text-left font-medium">Vch Ref.</th>
                                        <th className="p-4 text-right font-medium">Debit (₹)</th>
                                        <th className="p-4 text-right font-medium">Credit (₹)</th>
                                        <th className="p-4 text-right font-medium">Balance (₹)</th>
                                        <th className="p-4 text-center font-medium">Type</th>
                                        <th className="p-4 text-center font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {statementEntries.map((entry, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 text-slate-700">
                                                {entry.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td className="p-4 font-medium text-slate-800">
                                                {entry.type === 'Opening Balance' ? 'Opening Balance' : 
                                                 entry.type === 'Invoice' ? `Sales - ${selectedDealer.businessName}` : 
                                                 `Receipt - ${selectedDealer.businessName}`}
                                            </td>
                                            <td className="p-4 text-slate-500 font-medium italic text-xs">
                                                {entry.type}
                                            </td>
                                            <td className="p-4">
                                                <span className="font-mono px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">
                                                    {entry.reference}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right text-red-600 font-bold">
                                                {entry.debit > 0 ? entry.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                            </td>
                                            <td className="p-4 text-right text-emerald-600 font-bold">
                                                {entry.credit > 0 ? entry.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                            </td>
                                            <td className="p-4 text-right font-bold text-slate-900 bg-slate-50/30">
                                                ₹{Math.abs(entry.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter ${
                                                    entry.type === 'Payment'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {entry.type === 'Payment' ? 'Cr' : 'Dr'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                {entry.originalTransaction && (
                                                    <div className="flex justify-center gap-1">
                                                        <button
                                                            onClick={() => setSelectedInvoice(entry.originalTransaction)}
                                                            className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-emerald-600 transition-colors"
                                                            title="View Details"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTransaction(entry.originalTransaction.id, entry.reference, entry.type === 'Invoice' ? 'Invoice' : 'Receipt')}
                                                            className="p-1.5 hover:bg-red-50 rounded-full text-slate-400 hover:text-red-600 transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
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
            </div>
        );
    }

    // Dealer List View
    if (!mainContent) {
        mainContent = (
            <div className="h-full overflow-y-auto p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Dealer Ledgers</h1>
                        <p className="text-sm text-slate-500">View dealer statements and payment history</p>
                    </div>
                    <div className="flex gap-3 items-center">

                        <button
                            onClick={handleBulkSync}
                            disabled={isSyncing}
                            className="bg-emerald-600/90 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
                            title="Re-sync all data correctly from Database to Google Sheets"
                        >
                            {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <CloudUpload size={16} />}
                            {isSyncing ? 'Syncing...' : 'Sync to Sheets'}
                        </button>
                        <button
                            onClick={() => openDateModal('bulk-export')}
                            className="bg-white text-emerald-700 border border-emerald-200 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-50 transition-all shadow-sm"
                            title="Export all dealer statements as a single PDF"
                        >
                            <Download size={16} />
                            Export Statements
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg"
                        >
                            <User size={16} />
                            Add Dealer
                        </button>
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
                    {
                        filteredDealers.length === 0 ? (
                            <div className="col-span-full bg-white rounded-3xl border border-slate-200 p-20 flex flex-col items-center justify-center text-center shadow-sm">
                                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                                    <Building2 size={48} className="text-slate-200" />
                                </div>
                                <h3 className="text-2xl font-bold text-slate-800 mb-2">No Dealers Found</h3>
                                <p className="text-slate-500 max-w-sm mb-8">
                                    {searchTerm ? `No results for "${searchTerm}". Try a different name.` : "Start by adding your first dealer. Once added, you can manage their invoices, receipts, and statements."}
                                </p>
                                {!searchTerm && (
                                    <button
                                        onClick={() => setIsAddModalOpen(true)}
                                        className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95"
                                    >
                                        <User size={20} />
                                        Create Your First Dealer
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredDealers.map(d => (
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
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                const confirmed = await showConfirm({
                                                    title: 'Delete Dealer',
                                                    message: `Are you sure you want to delete ${d.businessName}?`,
                                                    confirmLabel: 'Delete',
                                                    type: 'danger'
                                                });
                                                if (confirmed) {
                                                    deleteDealer(d.id);
                                                    showToast('Dealer deleted successfully', 'info');
                                                }
                                            }}
                                            className="w-full mt-2 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-red-200"
                                        >
                                            <Trash2 size={14} />
                                            Delete Dealer
                                        </button>
                                    )}
                                </div>
                            ))
                        )
                    }
                </div >
            </div>
        );
    }


    return (
        <>
            {mainContent}

            {/* Add Dealer Modal */}
            {isAddModalOpen && (
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
                                        onBlur={() => {
                                            if (newDealer.phone.length > 0 && newDealer.phone.length < 10) {
                                                setAddPhoneError('Please fill out this field correctly. Phone number must be 10 digits.');
                                            } else {
                                                setAddPhoneError('');
                                            }
                                        }}
                                        type="text"
                                        required
                                        maxLength={10}
                                        className={`w-full p-2.5 border rounded-lg focus:ring-2 outline-none transition-colors ${addPhoneError
                                            ? 'border-red-400 focus:ring-red-400 bg-red-50'
                                            : 'border-slate-300 focus:ring-emerald-500'
                                            }`}
                                        value={newDealer.phone}
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            setNewDealer({ ...newDealer, phone: val });
                                            if (val.length === 10) setAddPhoneError('');
                                        }}
                                        placeholder="10-digit mobile number"
                                    />
                                    {addPhoneError && (
                                        <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                                            <span>⚠</span> {addPhoneError}
                                        </p>
                                    )}
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
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Opening Balance (₹)</label>
                                    <input
                                        ref={addRefs[8] as React.RefObject<HTMLInputElement>}
                                        onKeyDown={(e) => handleAddKeyDown(e)}
                                        type="number"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newDealer.openingBalance}
                                        onChange={e => setNewDealer({ ...newDealer, openingBalance: e.target.value === '' ? '' : Number(e.target.value) })}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Opening Balance Date</label>
                                    <input
                                        ref={addRefs[9] as React.RefObject<HTMLInputElement>}
                                        onKeyDown={(e) => handleAddKeyDown(e)}
                                        type="date"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newDealer.openingBalanceDate}
                                        onChange={e => setNewDealer({ ...newDealer, openingBalanceDate: e.target.value })}
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
                                    disabled={isSaving}
                                    className={`flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            Adding...
                                        </>
                                    ) : (
                                        'Add Dealer'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Dealer Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsEditModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-blue-50">
                            <h2 className="text-xl font-bold text-slate-800">Edit Dealer</h2>
                            <div className="flex gap-2 items-center">
                                <button
                                    onClick={() => {
                                        setIsEditModalOpen(false);
                                        setEditingDealer(null);
                                    }}
                                    className="text-slate-400 hover:text-slate-600 ml-2"
                                >
                                    <X size={24} />
                                </button>
                            </div>
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
                                        onBlur={() => {
                                            if (editDealer.phone.length > 0 && editDealer.phone.length < 10) {
                                                setEditPhoneError('Please fill out this field correctly. Phone number must be 10 digits.');
                                            } else {
                                                setEditPhoneError('');
                                            }
                                        }}
                                        type="text"
                                        required
                                        maxLength={10}
                                        className={`w-full p-2.5 border rounded-lg focus:ring-2 outline-none transition-colors ${editPhoneError
                                            ? 'border-red-400 focus:ring-red-400 bg-red-50'
                                            : 'border-slate-300 focus:ring-blue-500'
                                            }`}
                                        value={editDealer.phone}
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            setEditDealer({ ...editDealer, phone: val });
                                            if (val.length === 10) setEditPhoneError('');
                                        }}
                                        placeholder="10-digit mobile number"
                                    />
                                    {editPhoneError && (
                                        <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                                            <span>⚠</span> {editPhoneError}
                                        </p>
                                    )}
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
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Opening Balance (₹)</label>
                                    <input
                                        ref={editRefs[8] as React.RefObject<HTMLInputElement>}
                                        onKeyDown={(e) => handleEditKeyDown(e)}
                                        type="number"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editDealer.openingBalance}
                                        onChange={e => setEditDealer({ ...editDealer, openingBalance: e.target.value === '' ? '' : Number(e.target.value) })}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Opening Balance Date</label>
                                    <input
                                        ref={editRefs[9] as React.RefObject<HTMLInputElement>}
                                        onKeyDown={(e) => handleEditKeyDown(e)}
                                        type="date"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editDealer.openingBalanceDate}
                                        onChange={e => setEditDealer({ ...editDealer, openingBalanceDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                {editingDealer?.balance === 0 && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const confirmed = await showConfirm({
                                                title: 'Delete Dealer',
                                                message: `Are you sure you want to delete ${editingDealer.businessName}?`,
                                                confirmLabel: 'Delete',
                                                type: 'danger'
                                            });
                                            if (confirmed) {
                                                deleteDealer(editingDealer.id);
                                                setIsEditModalOpen(false);
                                                setEditingDealer(null);
                                                showToast('Dealer deleted successfully', 'info');
                                            }
                                        }}
                                        className="px-4 py-3 bg-red-50 text-red-600 font-bold rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                                        title="Delete Dealer"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                )}
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
                                    disabled={isSaving}
                                    className={`flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 flex items-center justify-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Changes'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── Date Range Modal ────────────────────────────────── */}
            {dateRangeModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={() => setDateRangeModal(prev => ({ ...prev, open: false }))}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={e => e.stopPropagation()}>

                        {/* Header */}
                        <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center">
                                    {dateRangeModal.mode === 'whatsapp' ? (
                                        <MessageSquare size={18} className="text-white" />
                                    ) : (
                                        <Download size={18} className="text-white" />
                                    )}
                                </div>
                                <div>
                                    <p className="font-bold text-white text-base">
                                        {dateRangeModal.mode === 'bulk-export' ? 'Export All Dealers' : 
                                         dateRangeModal.mode === 'whatsapp' ? 'Send Statement' : 'Export Statement'}
                                    </p>
                                    <p className="text-slate-400 text-xs">
                                        {dateRangeModal.mode === 'whatsapp' ? 'Send via WhatsApp' : 'Select date range for PDF'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setDateRangeModal(prev => ({ ...prev, open: false }))}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* 4 Option Cards */}
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'all', icon: <FileText size={22} />, label: 'Complete Statement', sub: 'All transactions' },
                                    { id: 'fy-pick', icon: <Calendar size={22} />, label: 'Financial Year', sub: 'Apr–Mar range' },
                                    { id: 'month-pick', icon: <Clock size={22} />, label: 'By Month', sub: 'Specific month' },
                                    { id: 'custom', icon: <Search size={22} />, label: 'Custom Range', sub: 'Pick from–to dates' },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setDateRangeModal(prev => ({ ...prev, rangeType: opt.id as any }))}
                                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center ${
                                            dateRangeModal.rangeType === opt.id
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
                                        }`}
                                    >
                                        <span className={dateRangeModal.rangeType === opt.id ? 'text-emerald-600' : 'text-slate-400'}>{opt.icon}</span>
                                        <span className="font-semibold text-sm leading-tight">{opt.label}</span>
                                        <span className="text-xs text-slate-400">{opt.sub}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Dynamic Sub-fields */}
                            {dateRangeModal.rangeType === 'fy-pick' && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Select Financial Year</label>
                                    <select 
                                        value={dateRangeModal.selectedYear}
                                        onChange={e => setDateRangeModal(prev => ({ ...prev, selectedYear: Number(e.target.value) }))}
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-sm"
                                    >
                                        {(() => {
                                            const currentYear = new Date().getFullYear();
                                            const startYear = 2022;
                                            const yearsList = Array.from({ length: (currentYear + 15) - startYear + 1 }, (_, i) => startYear + i).reverse();
                                            return yearsList.map(y => (
                                                <option key={y} value={y}>FY {y}-{String(y + 1).slice(-2)}</option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                            )}

                            {dateRangeModal.rangeType === 'month-pick' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Month</label>
                                        <select 
                                            value={dateRangeModal.selectedMonth}
                                            onChange={e => setDateRangeModal(prev => ({ ...prev, selectedMonth: Number(e.target.value) }))}
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-sm"
                                        >
                                            {MONTHS.map((m, i) => (
                                                <option key={i} value={i}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Year</label>
                                        <select 
                                            value={dateRangeModal.selectedYear}
                                            onChange={e => setDateRangeModal(prev => ({ ...prev, selectedYear: Number(e.target.value) }))}
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-sm"
                                        >
                                            {(() => {
                                                const currentYear = new Date().getFullYear();
                                                const startYear = 2022;
                                                const yearsList = Array.from({ length: (currentYear + 15) - startYear + 1 }, (_, i) => startYear + i).reverse();
                                                return yearsList.map(y => (
                                                    <option key={y} value={y}>{y}</option>
                                                ));
                                            })()}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {dateRangeModal.rangeType === 'custom' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">From Date</label>
                                        <input
                                            type="date"
                                            value={dateRangeModal.fromDate}
                                            onChange={e => setDateRangeModal(prev => ({ ...prev, fromDate: e.target.value }))}
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">To Date</label>
                                        <input
                                            type="date"
                                            value={dateRangeModal.toDate}
                                            onChange={e => setDateRangeModal(prev => ({ ...prev, toDate: e.target.value }))}
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setDateRangeModal(prev => ({ ...prev, open: false }))}
                                    className="flex-1 py-3 font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        if (dateRangeModal.mode === 'export') handleExportPDF();
                                        else if (dateRangeModal.mode === 'bulk-export') handleBulkExportPDF();
                                        else handleSendWhatsAppStatement();
                                    }}
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                                >
                                    {dateRangeModal.mode === 'export' ? (
                                        <><Download size={18} /> Export PDF</>
                                    ) : dateRangeModal.mode === 'bulk-export' ? (
                                        <><Download size={18} /> Export All</>
                                    ) : (
                                        <><MessageSquare size={18} /> Send</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
