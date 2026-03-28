'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmationContext';
import {
    SupplierData,
    PurchaseBillData,
    PurchasePaymentData,
    PurchaseAllocationData
} from '@/types';
import {
    getAllSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    createPurchaseBill,
    updatePurchaseBill,
    getPurchaseBills,
    deletePurchaseBill,
    createPurchasePayment,
    updatePurchasePayment,
    deletePurchasePayment,
    getPurchasePayments,
    getSupplierStatement,
    SupplierStatementEntry,
    recalculateSupplierBalance,
    getBillAllocations,
    forceSyncPurchases,
    suggestNextPaymentNumber
} from '@/lib/purchaseService';
import { createSupplierSheetTab, SupplierSheetDetails, CompanySheetDetails } from '@/lib/googleSheetSuppliers';
import { syncAllStatements } from '@/lib/folderSyncService';
import { getISTDateString } from '@/lib/utils';
import {
    Search,
    Plus,
    Edit2,
    Trash2,
    Building2,
    Receipt,
    Wallet,
    FileText,
    X,
    Calendar,
    DollarSign,
    RefreshCw,
    Download,
    Clock,
    ExternalLink
} from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';
import { supabase } from '@/lib/supabase';

type TabType = 'bills' | 'payments' | 'suppliers';

export default function PurchasesPage() {
    const { products, companySettings } = useData();
    const { showToast } = useToast();
    const { showConfirm } = useConfirm();
    const [activeTab, setActiveTab] = useState<TabType>('bills');
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    // Data states
    const [suppliers, setSuppliers] = useState<SupplierData[]>([]);
    const [bills, setBills] = useState<PurchaseBillData[]>([]);
    const [payments, setPayments] = useState<PurchasePaymentData[]>([]);

    // Modal states
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isBillModalOpen, setIsBillModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [isViewBillModalOpen, setIsViewBillModalOpen] = useState(false);

    const [editingSupplier, setEditingSupplier] = useState<SupplierData | null>(null);
    const [editingPayment, setEditingPayment] = useState<PurchasePaymentData | null>(null);
    const [editingBill, setEditingBill] = useState<PurchaseBillData | null>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<SupplierData | null>(null);
    const [selectedBill, setSelectedBill] = useState<PurchaseBillData | null>(null);
    const [statementData, setStatementData] = useState<SupplierStatementEntry[]>([]);
    const [billAllocations, setBillAllocations] = useState<PurchaseAllocationData[]>([]);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [sheetTabStatus, setSheetTabStatus] = useState<string | null>(null);

    const [dateRangeModal, setDateRangeModal] = useState<{
        open: boolean;
        mode: 'export' | 'bulk-export';
        range: 'all' | 'fy-pick' | 'month-pick' | 'custom';
        startDate: string;
        endDate: string;
        selectedFY: string;
        selectedMonth: string;
    }>({
        open: false,
        mode: 'bulk-export',
        range: 'all',
        startDate: '',
        endDate: '',
        selectedFY: `${new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear()}`,
        selectedMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    });

    const handleBulkExportSuppliersPDF = async () => {
        setIsGeneratingPdf(true);
        try {
            const { PDFDocument } = await import('pdf-lib');
            const { generateSupplierStatementPDFBase64 } = await import('@/lib/pdfGenerator');
            const { supabase } = await import('@/lib/supabase');

            const company = companySettings;

            // Determine date range
            let start: Date | undefined;
            let end: Date | undefined;
            let rangeLabel = 'Complete Statement';

            if (dateRangeModal.range === 'fy-pick') {
                const fy = parseInt(dateRangeModal.selectedFY);
                start = new Date(fy, 3, 1); // April 1st
                end = new Date(fy + 1, 2, 31, 23, 59, 59); // March 31st
                rangeLabel = `FY ${fy}-${(fy + 1).toString().slice(2)}`;
            } else if (dateRangeModal.range === 'month-pick') {
                const [y, m] = dateRangeModal.selectedMonth.split('-').map(Number);
                start = new Date(y, m - 1, 1);
                end = new Date(y, m, 0, 23, 59, 59);
                rangeLabel = new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
            } else if (dateRangeModal.range === 'custom') {
                start = new Date(dateRangeModal.startDate);
                end = new Date(dateRangeModal.endDate);
                end.setHours(23, 59, 59);
                rangeLabel = `${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`;
            }

            const mergedPdf = await PDFDocument.create();
            const sortedSuppliers = [...suppliers]
                .filter(s => s.name !== 'Unknown')
                .sort((a, b) => a.name.localeCompare(b.name));

            for (const supplier of sortedSuppliers) {
                const statement = await getSupplierStatement(supplier.id, start, end);
                if (statement.length === 0) continue;

                const base64 = await generateSupplierStatementPDFBase64(
                    { ...supplier, balance: statement[statement.length - 1].balance, openingBalance: supplier.openingBalance } as any,
                    statement,
                    company as any
                );

                const donorPdfBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                const donorPdf = await PDFDocument.load(donorPdfBytes);
                const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
                copiedPages.forEach(page => mergedPdf.addPage(page));
            }

            const pdfBytes = await mergedPdf.save();
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `All_Suppliers_Statement_${rangeLabel.replace(/ /g, '_')}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            setDateRangeModal(prev => ({ ...prev, open: false }));
        } catch (error) {
            console.error('Error generating bulk suppliers PDF:', error);
            showToast('Failed to generate bulk PDF', 'error');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    // Helper: format payment mode enum to human-readable
    const formatPaymentMode = (mode: string): string => {
        const map: Record<string, string> = {
            CASH: 'Cash',
            CHEQUE: 'Cheque',
            BANK_TRANSFER: 'Bank Transfer',
            UPI: 'UPI',
            OTHER: 'Other'
        };
        return map[mode] || mode;
    };

    // Form states
    const [supplierForm, setSupplierForm] = useState({
        name: '',
        contactPerson: '',
        phone: '',
        city: '',
        gstNumber: '',
        address: '',
        openingBalance: '' as string | number,
        openingBalanceDate: getISTDateString()
    });

    const [billForm, setBillForm] = useState({
        supplierId: '',
        billNumber: '',
        billDate: getISTDateString(),
        amount: 0,
        dueDate: '',
        notes: ''
    });

    const [billItems, setBillItems] = useState<any[]>([]);
    const [currentBillItem, setCurrentBillItem] = useState({
        productId: '',
        productName: '',
        quantity: 0,
        unitPrice: 0
    });
    const [showItemsSection, setShowItemsSection] = useState(true);

    const [paymentForm, setPaymentForm] = useState({
        supplierId: '',
        paymentNumber: '',
        paymentDate: getISTDateString(),
        amount: 0,
        paymentMode: 'CASH' as 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'OTHER',
        referenceNumber: '',
        notes: ''
    });

    // Refs for Supplier Form
    const supplierNameRef = useRef<HTMLInputElement>(null);
    const contactPersonRef = useRef<HTMLInputElement>(null);
    const supplierPhoneRef = useRef<HTMLInputElement>(null);
    const supplierCityRef = useRef<HTMLInputElement>(null);
    const supplierGstRef = useRef<HTMLInputElement>(null);
    const supplierOpeningBalanceRef = useRef<HTMLInputElement>(null);
    const supplierOpeningBalanceDateRef = useRef<HTMLInputElement>(null);
    const supplierAddressRef = useRef<HTMLTextAreaElement>(null);

    const supplierRefs = [
        supplierNameRef,
        contactPersonRef,
        supplierPhoneRef,
        supplierCityRef,
        supplierGstRef,
        supplierOpeningBalanceRef,
        supplierOpeningBalanceDateRef,
        supplierAddressRef
    ];
    const { handleKeyDown: handleSupplierKeyDown } = useEnterKeyNavigation(supplierRefs);

    // Refs for Payment Form
    const paymentSupplierRef = useRef<HTMLSelectElement>(null);
    const paymentNumberRef = useRef<HTMLInputElement>(null);
    const paymentAmountRef = useRef<HTMLInputElement>(null);
    const paymentDateRef = useRef<HTMLInputElement>(null);
    const paymentModeRef = useRef<HTMLSelectElement>(null);
    const paymentReferenceRef = useRef<HTMLInputElement>(null);
    const paymentNotesRef = useRef<HTMLTextAreaElement>(null);

    const paymentRefs = [
        paymentSupplierRef,
        paymentNumberRef,
        paymentAmountRef,
        paymentDateRef,
        paymentModeRef,
        paymentReferenceRef,
        paymentNotesRef
    ];
    const { handleKeyDown: handlePaymentKeyDown } = useEnterKeyNavigation(paymentRefs);

    // Refs for Bill Form (Main fields)
    const billSupplierRef = useRef<HTMLSelectElement>(null);
    const billNumberRef = useRef<HTMLInputElement>(null);
    const billDateRef = useRef<HTMLInputElement>(null);
    const billTotalRef = useRef<HTMLInputElement>(null);
    const billDueDateRef = useRef<HTMLInputElement>(null);
    const billNotesRef = useRef<HTMLTextAreaElement>(null);

    // Refs for Bill Product Entry (Custom navigation)
    const billProductRef = useRef<HTMLSelectElement>(null);
    const billQtyRef = useRef<HTMLInputElement>(null);
    const billCostRef = useRef<HTMLInputElement>(null);
    const billAddBtnRef = useRef<HTMLButtonElement>(null);

    const billMainRefs = [
        billSupplierRef,
        billNumberRef,
        billDateRef,
        billTotalRef,
        billDueDateRef,
        billNotesRef
    ];
    const { handleKeyDown: handleBillKeyDown } = useEnterKeyNavigation(billMainRefs);

    // Custom handler for Product Entry Row
    const handleProductEntryKeyDown = (e: React.KeyboardEvent, field: 'product' | 'qty' | 'cost') => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (field === 'product') {
                billQtyRef.current?.focus();
            } else if (field === 'qty') {
                billCostRef.current?.focus();
            } else if (field === 'cost') {
                if (currentBillItem.productId && currentBillItem.quantity) {
                    handleAddBillItem();
                    setTimeout(() => billProductRef.current?.focus(), 0);
                } else {
                    billAddBtnRef.current?.focus();
                }
            }
        }
    };

    const loadData = async () => {
        setIsLoading(true);
        const [suppliersData, billsData, paymentsData] = await Promise.all([
            getAllSuppliers(),
            getPurchaseBills(),
            getPurchasePayments()
        ]);
        setSuppliers(suppliersData);
        setBills(billsData);
        setPayments(paymentsData);
        setIsLoading(false);
    };

    useEffect(() => {
        const autoSync = async () => {
            setIsSyncing(true);
            try {
                await forceSyncPurchases();
            } catch (error) {
                console.error('Auto-sync failed:', error);
            } finally {
                setIsSyncing(false);
                loadData();
            }
        };
        autoSync();
    }, []);

    const handleSupplierSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (supplierForm.phone && supplierForm.phone.length !== 10) {
            showToast('Phone number must be exactly 10 digits', 'warning');
            return;
        }

        if (supplierForm.openingBalance === '') {
            showToast('Opening balance is compulsory (Enter 0 if none)', 'warning');
            return;
        }

        const numericForm = {
            ...supplierForm,
            openingBalance: typeof supplierForm.openingBalance === 'string' 
                ? parseFloat(supplierForm.openingBalance) || 0 
                : supplierForm.openingBalance
        };

        if (editingSupplier) {
            await updateSupplier(editingSupplier.id, numericForm);
        } else {
            await createSupplier(numericForm);
        }

        // Always Update/Create corresponding Google Sheet tab
        setSheetTabStatus('Updating Google Sheet tab...');

        const company: CompanySheetDetails = {
            companyName: companySettings.companyName,
            address: [companySettings.addressLine1, companySettings.addressLine2].filter(Boolean).join(', '),
            city: companySettings.city,
            gstNumber: companySettings.gstNumber,
            phone: companySettings.phone,
            email: companySettings.email
        };

        const supplierDetails: SupplierSheetDetails = {
            supplierName: supplierForm.name,
            supplierAddress: supplierForm.address,
            supplierCity: supplierForm.city,
            supplierGst: supplierForm.gstNumber,
            supplierPhone: supplierForm.phone,
            supplierContactPerson: supplierForm.contactPerson,
            openingBalance: typeof supplierForm.openingBalance === 'string' 
                ? parseFloat(supplierForm.openingBalance) || 0 
                : (supplierForm.openingBalance || 0),
            openingBalanceDate: supplierForm.openingBalanceDate
        };

        const ok = await createSupplierSheetTab(supplierDetails, company).catch(() => false);
        setSheetTabStatus(ok
            ? `✓ Sheet tab "${supplierForm.name}" updated in Google Sheets`
            : '⚠ Supplier saved. Sheet sync failed (check network/permissions)');
        setTimeout(() => setSheetTabStatus(null), 6000);

        setIsSupplierModalOpen(false);
        resetSupplierForm();
        loadData();
    };

    const handleDeleteSupplier = async (id: string) => {
        const confirmed = await showConfirm({
            title: 'Delete Supplier',
            message: 'Are you sure you want to delete this supplier from the ERP? This will remove all their data locally, but will PRESERVE their data in the Google Spreadsheet tabs.',
            confirmLabel: 'Delete',
            type: 'danger'
        });
        if (confirmed) {
            await deleteSupplier(id);
            showToast('Supplier deleted successfully', 'info');
        }
        loadData();
    };

    const openEditSupplier = (supplier: SupplierData) => {
        setEditingSupplier(supplier);
        setSupplierForm({
            name: supplier.name,
            contactPerson: supplier.contactPerson || '',
            phone: supplier.phone || '',
            city: supplier.city || '',
            gstNumber: supplier.gstNumber || '',
            address: supplier.address || '',
            openingBalance: supplier.openingBalance?.toString() || '0',
            openingBalanceDate: supplier.openingBalanceDate
                ? (typeof supplier.openingBalanceDate === 'string'
                    ? supplier.openingBalanceDate
                    : supplier.openingBalanceDate.toISOString().split('T')[0])
                : getISTDateString()
        });
        setIsSupplierModalOpen(true);
    };

    const resetSupplierForm = () => {
        setEditingSupplier(null);
        setSupplierForm({
            name: '',
            contactPerson: '',
            phone: '',
            city: '',
            gstNumber: '',
            address: '',
            openingBalance: '',
            openingBalanceDate: getISTDateString()
        });
    };

    const handleBillSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation: Prevent "Unknown"
        const supplier = suppliers.find(s => s.id === billForm.supplierId);
        if (!supplier || supplier.name === 'Unknown') {
            showToast('Please select a valid supplier (not "Unknown").', 'warning');
            return;
        }

        let finalItems = [...billItems];
        if (currentBillItem.productId && currentBillItem.quantity > 0) {
            const total = currentBillItem.quantity * currentBillItem.unitPrice;
            const newItem = { ...currentBillItem, total };
            finalItems.push(newItem);
        }
        let finalAmount = billForm.amount;
        if (finalItems.length > 0) {
            finalAmount = finalItems.reduce((sum, item) => sum + item.total, 0);
        }
        if (editingBill) {
            await updatePurchaseBill(editingBill.id, {
                billNumber: billForm.billNumber,
                billDate: new Date(billForm.billDate),
                amount: finalAmount,
                dueDate: billForm.dueDate ? new Date(billForm.dueDate) : undefined,
                items: finalItems,
                notes: billForm.notes
            });
        } else {
            await createPurchaseBill({
                supplierId: billForm.supplierId,
                billNumber: billForm.billNumber,
                billDate: new Date(billForm.billDate),
                amount: finalAmount,
                dueDate: billForm.dueDate ? new Date(billForm.dueDate) : undefined,
                items: finalItems,
                notes: billForm.notes
            });
        }
        setIsBillModalOpen(false);
        resetBillForm();
        loadData();
    };

    const openEditBill = (bill: PurchaseBillData) => {
        setEditingBill(bill);
        setBillForm({
            supplierId: bill.supplierId,
            billNumber: bill.billNumber,
            billDate: new Date(bill.billDate).toISOString().split('T')[0],
            amount: bill.amount,
            dueDate: bill.dueDate ? new Date(bill.dueDate).toISOString().split('T')[0] : '',
            notes: bill.notes || ''
        });
        const existingItems = bill.items || [];
        setBillItems(existingItems);
        setShowItemsSection(existingItems.length > 0);
        setIsBillModalOpen(true);
    };

    const handleDeleteBill = async (id: string) => {
        const confirmed = await showConfirm({
            title: 'Delete Bill',
            message: 'Are you sure you want to delete this bill? This will reverse the stock updates and supplier balance.',
            confirmLabel: 'Delete',
            type: 'danger'
        });
        if (confirmed) {
            await deletePurchaseBill(id);
            showToast('Bill deleted successfully', 'info');
        }
        loadData();
    };

    const resetBillForm = () => {
        setEditingBill(null);
        setBillForm({
            supplierId: '',
            billNumber: '',
            billDate: getISTDateString(),
            amount: 0,
            dueDate: '',
            notes: ''
        });
        setBillItems([]);
        setCurrentBillItem({
            productId: '',
            productName: '',
            quantity: 0,
            unitPrice: 0
        });
        setShowItemsSection(true);
    };

    const handleAddBillItem = () => {
        if (!currentBillItem.productId || !currentBillItem.quantity) return;
        const total = currentBillItem.quantity * currentBillItem.unitPrice;
        const newItem = { ...currentBillItem, total };
        const newItems = [...billItems, newItem];
        setBillItems(newItems);
        const newTotal = newItems.reduce((sum, item) => sum + item.total, 0);
        setBillForm(prev => ({ ...prev, amount: newTotal }));
        setCurrentBillItem({
            productId: '',
            productName: '',
            quantity: 0,
            unitPrice: 0
        });
    };

    const handlePaymentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation: Prevent "Unknown"
        const supplier = suppliers.find(s => s.id === paymentForm.supplierId);
        if (!supplier || supplier.name === 'Unknown') {
            showToast('Please select a valid supplier (not "Unknown").', 'warning');
            return;
        }

        if (editingPayment) {
            await updatePurchasePayment(editingPayment.id, {
                paymentNumber: paymentForm.paymentNumber,
                paymentDate: new Date(paymentForm.paymentDate),
                amount: paymentForm.amount,
                paymentMode: paymentForm.paymentMode,
                referenceNumber: paymentForm.referenceNumber,
                notes: paymentForm.notes
            });
        } else {
            await createPurchasePayment({
                supplierId: paymentForm.supplierId,
                paymentNumber: paymentForm.paymentNumber,
                paymentDate: new Date(paymentForm.paymentDate),
                amount: paymentForm.amount,
                paymentMode: paymentForm.paymentMode,
                referenceNumber: paymentForm.referenceNumber,
                notes: paymentForm.notes
            });
        }
        setIsPaymentModalOpen(false);
        resetPaymentForm();
        loadData();
    };

    const handleDeletePayment = async (id: string) => {
        const confirmed = await showConfirm({
            title: 'Delete Payment',
            message: 'Are you sure you want to delete this payment? This will revert allocations and update supplier balance.',
            confirmLabel: 'Delete',
            type: 'danger'
        });
        if (confirmed) {
            await deletePurchasePayment(id);
            showToast('Payment deleted successfully', 'info');
        }
        loadData();
    };

    const openEditPayment = (payment: PurchasePaymentData) => {
        setEditingPayment(payment);
        setPaymentForm({
            supplierId: payment.supplierId,
            paymentNumber: payment.paymentNumber,
            paymentDate: new Date(payment.paymentDate).toISOString().split('T')[0],
            amount: payment.amount,
            paymentMode: payment.paymentMode as any,
            referenceNumber: payment.referenceNumber || '',
            notes: payment.notes || ''
        });
        setIsPaymentModalOpen(true);
    };

    const resetPaymentForm = async () => {
        const nextNo = await suggestNextPaymentNumber();
        setEditingPayment(null);
        setPaymentForm({
            supplierId: '',
            paymentNumber: nextNo,
            paymentDate: getISTDateString(),
            amount: 0,
            paymentMode: 'CASH',
            referenceNumber: '',
            notes: ''
        });
    };

    const viewStatement = async (supplier: SupplierData) => {
        const statement = await getSupplierStatement(supplier.id);
        const lastEntry = statement.length > 0 ? statement[statement.length - 1] : null;
        const finalBalance = lastEntry ? lastEntry.balance : (supplier.openingBalance || 0);
        setSelectedSupplier({ ...supplier, balance: finalBalance });
        setStatementData(statement);
        setIsStatementModalOpen(true);
        if (supplier.balance !== finalBalance) {
            setSuppliers(prev => prev.map(s => s.id === supplier.id ? { ...s, balance: finalBalance } : s));
            try {
                await recalculateSupplierBalance(supplier.id);
            } catch (err) {
                console.error('Failed to sync balance in DB:', err);
            }
        }
    };

    const handleRefreshBalance = async (supplier: SupplierData) => {
        const newBalance = await recalculateSupplierBalance(supplier.id);
        setSuppliers(prev => prev.map(s => s.id === supplier.id ? { ...s, balance: newBalance } : s));
    };

    const handleViewBill = async (bill: PurchaseBillData) => {
        setSelectedBill(bill);
        const allocations = await getBillAllocations(bill.id);
        setBillAllocations(allocations);
        setIsViewBillModalOpen(true);
    };

    const downloadBillPdf = async (bill: PurchaseBillData) => {
        if (!bill) return;
        setIsGeneratingPdf(true);
        try {
            const jsPDF = (await import('jspdf')).default;
            const autoTable = (await import('jspdf-autotable')).default;
            const doc = new jsPDF();
            const supplier = suppliers.find(s => s.id === bill.supplierId);
            doc.setFontSize(22);
            doc.setTextColor(40, 40, 40);
            doc.text('Purchase Bill', 14, 20);
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 26);
            doc.setDrawColor(200, 200, 200);
            doc.setFillColor(250, 250, 250);
            doc.rect(14, 35, 182, 35, 'FD');
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(12);
            doc.text(`Bill #${bill.billNumber}`, 20, 45);
            doc.setFontSize(10);
            doc.text(`Date: ${bill.billDate.toLocaleDateString()}`, 20, 52);
            doc.text(`Due Date: ${bill.dueDate ? bill.dueDate.toLocaleDateString() : 'N/A'}`, 20, 58);
            if (supplier) {
                doc.text(`Supplier:`, 110, 45);
                doc.setFont('helvetica', 'bold');
                doc.text(`${supplier.name}`, 110, 50);
                doc.setFont('helvetica', 'normal');
                if (supplier.city) doc.text(supplier.city, 110, 55);
                if (supplier.phone) doc.text(`Ph: ${supplier.phone}`, 110, 60);
                if (supplier.gstNumber) doc.text(`GST: ${supplier.gstNumber}`, 110, 65);
            }
            const tableColumn = ["Product", "Qty", "Cost", "Total"];
            const tableRows: any[] = [];
            if (bill.items && Array.isArray(bill.items)) {
                bill.items.forEach((item: any) => {
                    const billItem = [
                        item.productName,
                        item.quantity,
                        `Rs. ${(item.unitPrice || 0).toLocaleString()}`,
                        `Rs. ${(item.total || 0).toLocaleString()}`
                    ];
                    tableRows.push(billItem);
                });
            }
            (autoTable as any)(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: 80,
                theme: 'grid',
                headStyles: { fillColor: [16, 185, 129] },
                styles: { fontSize: 9 },
            });
            const finalY = (doc as any).lastAutoTable.finalY + 10;
            doc.setFontSize(10);
            doc.text(`Total Amount:`, 140, finalY);
            doc.setFont('helvetica', 'bold');
            doc.text(`Rs. ${bill.amount.toLocaleString()}`, 170, finalY);
            doc.setFont('helvetica', 'normal');
            doc.text(`Paid Amount:`, 140, finalY + 6);
            doc.setTextColor(22, 163, 74);
            doc.text(`Rs. ${bill.paidAmount.toLocaleString()}`, 170, finalY + 6);
            doc.setTextColor(0, 0, 0);
            doc.text(`Balance:`, 140, finalY + 12);
            if ((bill.balance || 0) > 0) doc.setTextColor(220, 38, 38);
            doc.text(`Rs. ${(bill.balance || 0).toLocaleString()}`, 170, finalY + 12);
            doc.save(`bill_${bill.billNumber}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            showToast('Failed to generate PDF', 'error');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const downloadStatementPdf = async () => {
        if (!selectedSupplier || statementData.length === 0) return;
        setIsGeneratingPdf(true);
        try {
            const jsPDF = (await import('jspdf')).default;
            const autoTable = (await import('jspdf-autotable')).default;
            const doc = new jsPDF();
            doc.setFontSize(22);
            doc.text('Supplier Statement', 14, 20);
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 26);
            doc.setDrawColor(200, 200, 200);
            doc.setFillColor(250, 250, 250);
            doc.rect(14, 30, 182, 30, 'FD');
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(selectedSupplier.name, 20, 42);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            if (selectedSupplier.phone) doc.text(`Phone: ${selectedSupplier.phone}`, 20, 48);
            if (selectedSupplier.city) doc.text(`City: ${selectedSupplier.city}`, 20, 54);
            const finalBalance = selectedSupplier.balance;
            doc.text(`Current Balance:`, 140, 42);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            if (finalBalance > 0) doc.setTextColor(220, 38, 38);
            doc.text(`Rs. ${finalBalance.toLocaleString()}`, 140, 48);
            doc.setTextColor(0, 0, 0);
            const tableColumn = ["Date", "Type", "Reference", "Particulars", "Debit (+)", "Credit (-)", "Balance"];
            const tableRows = statementData.map(entry => [
                new Date(entry.date).toLocaleDateString(),
                entry.reference?.toUpperCase() === 'BAL B/F' ? 'Balance' : (entry.type === 'BILL' ? 'Pur. Bill' : 'Payment'),
                entry.reference,
                entry.notes || '-',
                entry.debit > 0 ? entry.debit.toLocaleString() : '-',
                entry.credit > 0 ? entry.credit.toLocaleString() : '-',
                entry.balance.toLocaleString()
            ]);
            (autoTable as any)(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: 70,
                theme: 'striped',
                headStyles: { fillColor: [16, 185, 129] },
                styles: { fontSize: 8 },
            });
            doc.save(`${selectedSupplier.name}_Statement.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            showToast('Failed to generate PDF', 'error');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const filteredSuppliers = useMemo(() => {
        const searchTermLower = searchTerm.toLowerCase();
        return suppliers
            .filter(s => s.name !== 'Unknown')
            .filter(s =>
                (s.name || '').toLowerCase().includes(searchTermLower) ||
                (s.city || '').toLowerCase().includes(searchTermLower)
            );
    }, [suppliers, searchTerm]);

    const filteredBills = useMemo(() => {
        const searchTermLower = searchTerm.toLowerCase();
        return bills.filter(b => {
            const supplier = suppliers.find(s => s.id === b.supplierId);
            return (b.billNumber || '').toLowerCase().includes(searchTermLower) ||
                (supplier?.name || '').toLowerCase().includes(searchTermLower);
        });
    }, [bills, suppliers, searchTerm]);

    const filteredPayments = useMemo(() => {
        const searchTermLower = searchTerm.toLowerCase();
        return payments.filter(p => {
            const supplier = suppliers.find(s => s.id === p.supplierId);
            return (p.paymentNumber || '').toLowerCase().includes(searchTermLower) ||
                (supplier?.name || '').toLowerCase().includes(searchTermLower);
        });
    }, [payments, suppliers, searchTerm]);

    return (
        <div className="p-6 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Purchase Management</h1>
                    <p className="text-sm text-slate-500">Track suppliers, bills, and payments</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={async () => {
                            if (activeTab === 'suppliers') {
                                resetSupplierForm();
                                setIsSupplierModalOpen(true);
                            } else if (activeTab === 'bills') {
                                resetBillForm();
                                setIsBillModalOpen(true);
                            } else {
                                await resetPaymentForm();
                                setIsPaymentModalOpen(true);
                            }
                        }}
                        className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg"
                    >
                        <Plus size={16} />
                        {activeTab === 'suppliers' ? 'Add Supplier' : activeTab === 'bills' ? 'New Bill' : 'New Payment'}
                    </button>
                    {activeTab === 'suppliers' && (
                        <button
                            onClick={() => setDateRangeModal(prev => ({ ...prev, open: true, mode: 'bulk-export' }))}
                            className="bg-white text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-50 transition-all shadow-sm"
                            title="Export all supplier statements"
                        >
                            <Download size={16} />
                            Export Statements
                        </button>
                    )}
                </div>
            </div>

            {/* Sheet tab status toast */}
            {sheetTabStatus && (
                <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 ${sheetTabStatus.startsWith('✓')
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : sheetTabStatus.startsWith('Creating')
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                    <span>{sheetTabStatus}</span>
                </div>
            )}

            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('bills')}
                    className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'bills'
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <Receipt size={16} />
                        Purchase Bills
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('payments')}
                    className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'payments'
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <Wallet size={16} />
                        Payments
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('suppliers')}
                    className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'suppliers'
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <Building2 size={16} />
                        Suppliers
                    </div>
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex gap-4 items-center">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input
                            id="purchases-search"
                            type="text"
                            placeholder="Search..."
                            className="pl-10 pr-4 py-2 border rounded-lg w-full outline-none focus:ring-2 focus:ring-emerald-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-slate-500">Loading...</div>
                ) : activeTab === 'suppliers' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="p-4">Supplier Name</th>
                                    <th className="p-4">Contact</th>
                                    <th className="p-4">Phone</th>
                                    <th className="p-4">City</th>
                                    <th className="p-4 text-right">Balance</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSuppliers.map(s => {
                                    return (
                                        <tr key={s.id} className="hover:bg-slate-50">
                                            <td className="p-4 font-medium text-slate-800">{s.name}</td>
                                            <td className="p-4 text-slate-600">{s.contactPerson || '-'}</td>
                                            <td className="p-4 text-slate-600">{s.phone || '-'}</td>
                                            <td className="p-4 text-slate-600">{s.city || '-'}</td>
                                            <td className="p-4 text-right font-bold text-red-600">₹{(s.balance || 0).toLocaleString()}</td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => handleRefreshBalance(s)}
                                                        className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                                        title="Refresh Balance"
                                                    >
                                                        <RefreshCw size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => viewStatement(s)}
                                                        className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                                        title="View Statement"
                                                    >
                                                        <FileText size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => openEditSupplier(s)}
                                                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSupplier(s.id)}
                                                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : activeTab === 'bills' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="p-4">Bill No</th>
                                    <th className="p-4">Supplier</th>
                                    <th className="p-4">Date</th>
                                    <th className="p-4 text-right">Amount</th>
                                    <th className="p-4 text-right">Paid</th>
                                    <th className="p-4 text-right">Balance</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredBills.map(b => {
                                    const supplier = suppliers.find(s => s.id === b.supplierId);
                                    return (
                                        <tr key={b.id} className="hover:bg-slate-50">
                                            <td className="p-4 font-mono font-bold text-slate-800">{b.billNumber}</td>
                                            <td className="p-4 font-medium text-slate-700">{supplier?.name || b.supplierName || 'Unknown'}</td>
                                            <td className="p-4 text-slate-600">{b.billDate.toLocaleDateString('en-US')}</td>
                                            <td className="p-4 text-right font-medium">₹{(b.amount || 0).toLocaleString()}</td>
                                            <td className="p-4 text-right text-green-600">₹{(b.paidAmount || 0).toLocaleString()}</td>
                                            <td className="p-4 text-right font-bold text-red-600">₹{(b.balance || 0).toLocaleString()}</td>
                                            <td className="p-4 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => handleViewBill(b)}
                                                        className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                                        title="View Bill Details"
                                                    >
                                                        <FileText size={16} />
                                                    </button>
                                                    {/* Only allow editing manually-created bills (not HIST- synced) */}
                                                    {!b.id.startsWith('HIST-') && (
                                                        <button
                                                            onClick={() => openEditBill(b)}
                                                            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                            title="Edit Bill"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteBill(b.id)}
                                                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                        title="Delete Bill"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="p-4">Payment No</th>
                                    <th className="p-4">Supplier</th>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Mode</th>
                                    <th className="p-4 text-right">Amount</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredPayments.map(p => {
                                    const supplier = suppliers.find(s => s.id === p.supplierId);
                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50">
                                            <td className="p-4 font-mono font-bold text-slate-800">{p.paymentNumber}</td>
                                            <td className="p-4 font-medium text-slate-700">{supplier?.name || p.supplierName || 'Unknown'}</td>
                                            <td className="p-4 text-slate-600">{p.paymentDate.toLocaleDateString('en-US')}</td>
                                            <td className="p-4 text-slate-600">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                                                    {formatPaymentMode(p.paymentMode)}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-bold text-green-600">₹{p.amount.toLocaleString()}</td>
                                            <td className="p-4 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => openEditPayment(p)}
                                                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                        title="Edit Payment"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePayment(p.id)}
                                                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                        title="Delete Payment"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {/* END PART 1 */}

            {/* Supplier Modal */}
            {
                isSupplierModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setIsSupplierModalOpen(false)}
                        />
                        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden z-10">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h2 className="text-xl font-bold text-slate-800">
                                    {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
                                </h2>
                                <div className="flex gap-2 items-center">
                                    {editingSupplier && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const confirmed = await showConfirm({
                                                    title: 'Close Financial Year',
                                                    message: 'This will close the current financial year for this supplier. It will delete local transaction history (saving space) and append Closing/Opening rows to their Google Sheet ledger. Proceed?',
                                                    confirmLabel: 'Yes, Roll Over',
                                                    type: 'danger'
                                                });
                                                if (confirmed) {
                                                    const defaultYear = new Date().getMonth() < 3 ? new Date().getFullYear() : new Date().getFullYear();
                                                    const closingDateStr = prompt('Enter Closing Date (YYYY-MM-DD):', `${defaultYear}-03-31`);
                                                    if (!closingDateStr) return;
                                                    const openingDateStr = prompt('Enter New Opening Date (YYYY-MM-DD):', `${defaultYear}-04-01`);
                                                    if (!openingDateStr) return;
                                                    
                                                    try {
                                                        const { rollOverSupplierYear } = await import('@/lib/purchaseService');
                                                        await rollOverSupplierYear(editingSupplier.id, closingDateStr, openingDateStr);
                                                        showToast('Financial year rolled over successfully!', 'success');
                                                        setIsSupplierModalOpen(false);
                                                        loadData();
                                                    } catch (e) {
                                                        showToast('Rollover failed', 'error');
                                                    }
                                                }
                                            }}
                                            className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg font-medium transition-colors"
                                        >
                                            Close Financial Year
                                        </button>
                                    )}
                                    <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600 ml-2">
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>
                            <form onSubmit={handleSupplierSubmit} className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Supplier Name *</label>
                                        <input
                                            ref={supplierNameRef}
                                            autoFocus
                                            onKeyDown={(e) => handleSupplierKeyDown(e)}
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={supplierForm.name}
                                            onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                                        <input
                                            ref={contactPersonRef}
                                            onKeyDown={(e) => handleSupplierKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={supplierForm.contactPerson}
                                            onChange={e => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                                        <input
                                            ref={supplierPhoneRef}
                                            onKeyDown={(e) => handleSupplierKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={supplierForm.phone}
                                            onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                        <input
                                            ref={supplierCityRef}
                                            onKeyDown={(e) => handleSupplierKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={supplierForm.city}
                                            onChange={e => setSupplierForm({ ...supplierForm, city: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
                                        <input
                                            ref={supplierGstRef}
                                            onKeyDown={(e) => handleSupplierKeyDown(e)}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={supplierForm.gstNumber}
                                            onChange={e => setSupplierForm({ ...supplierForm, gstNumber: e.target.value.toUpperCase() })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Opening Balance (₹)</label>
                                        <input
                                            ref={supplierOpeningBalanceRef}
                                            onKeyDown={(e) => handleSupplierKeyDown(e)}
                                            type="number"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={supplierForm.openingBalance}
                                            onChange={e => setSupplierForm({ ...supplierForm, openingBalance: e.target.value })}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Opening Balance Date</label>
                                        <input
                                            ref={supplierOpeningBalanceDateRef}
                                            onKeyDown={(e) => handleSupplierKeyDown(e)}
                                            type="date"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={supplierForm.openingBalanceDate}
                                            onChange={e => setSupplierForm({ ...supplierForm, openingBalanceDate: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                    <textarea
                                        ref={supplierAddressRef}
                                        onKeyDown={(e) => handleSupplierKeyDown(e)}
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        rows={3}
                                        value={supplierForm.address}
                                        onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
                                    />
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsSupplierModalOpen(false)}
                                        className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg border border-slate-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg"
                                    >
                                        {editingSupplier ? 'Update Supplier' : 'Save Supplier'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Bill Modal */}
            {
                isBillModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setIsBillModalOpen(false)}
                        />
                        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h2 className="text-xl font-bold text-slate-800">
                                    {editingBill ? 'Edit Purchase Bill' : 'New Purchase Bill'}
                                </h2>
                                <button onClick={() => setIsBillModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>
                            <form onSubmit={handleBillSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
                                        <SearchableSelect
                                            options={suppliers.filter(s => s.name !== 'Unknown')}
                                            value={billForm.supplierId}
                                            onChange={(val) => setBillForm({ ...billForm, supplierId: val })}
                                            placeholder="Search Supplier"
                                            className="w-full"
                                            ref={billSupplierRef}
                                            onKeyDown={(e) => handleBillKeyDown(e)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Bill Number *</label>
                                        <input
                                            ref={billNumberRef}
                                            onKeyDown={(e) => handleBillKeyDown(e)}
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={billForm.billNumber}
                                            onChange={e => setBillForm({ ...billForm, billNumber: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Bill Date *</label>
                                        <input
                                            ref={billDateRef}
                                            onKeyDown={(e) => handleBillKeyDown(e)}
                                            type="date"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={billForm.billDate}
                                            onChange={e => setBillForm({ ...billForm, billDate: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Items Section - Optional Toggle */}
                                <div className="rounded-xl border border-slate-200 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setShowItemsSection(prev => !prev)}
                                        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Add Items</h3>
                                            <span className="text-[10px] font-medium bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-wider">Optional</span>
                                            {billItems.length > 0 && (
                                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                                    {billItems.length} item{billItems.length > 1 ? 's' : ''} added
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-slate-400 text-xs font-medium">
                                            {showItemsSection ? '▲ Hide' : '▼ Show'}
                                        </span>
                                    </button>

                                    {!showItemsSection && (
                                        <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
                                            <span className="text-amber-500 text-base leading-none mt-0.5">💡</span>
                                            <p className="text-xs text-amber-700">
                                                <strong>Bill without products</strong> — Useful for packaging materials (boxes, covers) or other miscellaneous purchases. Enter the total amount below directly.
                                            </p>
                                        </div>
                                    )}

                                    {showItemsSection && (
                                        <div className="p-4 space-y-3 bg-white">
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                                <div className="md:col-span-5">
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Product</label>
                                                    <SearchableSelect
                                                        options={products}
                                                        value={currentBillItem.productId}
                                                        onChange={(val: string) => {
                                                            const prod = products.find(p => p.id === val);
                                                            setCurrentBillItem({
                                                                ...currentBillItem,
                                                                productId: val,
                                                                productName: prod?.name || '',
                                                                unitPrice: prod?.costPrice || prod?.price || 0
                                                            });
                                                        }}
                                                        placeholder="Search Product"
                                                        className="w-full"
                                                        ref={billProductRef}
                                                        onKeyDown={(e: React.KeyboardEvent) => handleProductEntryKeyDown(e, 'product')}
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Quantity</label>
                                                    <input
                                                        ref={billQtyRef}
                                                        onKeyDown={(e) => handleProductEntryKeyDown(e, 'qty')}
                                                        type="number"
                                                        step="0.001"
                                                        min="0"
                                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                                        value={currentBillItem.quantity || ''}
                                                        onChange={e => setCurrentBillItem({ ...currentBillItem, quantity: parseFloat(e.target.value) || 0 })}
                                                    />
                                                </div>
                                                <div className="md:col-span-3">
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Unit Cost</label>
                                                    <input
                                                        ref={billCostRef}
                                                        onKeyDown={(e) => handleProductEntryKeyDown(e, 'cost')}
                                                        type="number"
                                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                                        value={currentBillItem.unitPrice || ''}
                                                        onChange={e => setCurrentBillItem({ ...currentBillItem, unitPrice: parseFloat(e.target.value) || 0 })}
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <button
                                                        ref={billAddBtnRef}
                                                        type="button"
                                                        onClick={() => handleAddBillItem()}
                                                        className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold hover:bg-slate-700 transition-colors"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            </div>

                                            {billItems.length > 0 && (
                                                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-slate-100 text-slate-600 font-bold">
                                                            <tr>
                                                                <th className="p-2 text-left">Product</th>
                                                                <th className="p-2 text-center">Qty</th>
                                                                <th className="p-2 text-right">Cost</th>
                                                                <th className="p-2 text-right">Total</th>
                                                                <th className="p-2 text-center">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {billItems.map((item, idx) => (
                                                                <tr key={idx}>
                                                                    <td className="p-2">{item.productName}</td>
                                                                    <td className="p-2 text-center">{Number(item.quantity).toFixed(3)}</td>
                                                                    <td className="p-2 text-right">₹{item.unitPrice.toLocaleString()}</td>
                                                                    <td className="p-2 text-right font-bold">₹{item.total.toLocaleString()}</td>
                                                                    <td className="p-2 text-center">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const newItems = billItems.filter((_, i) => i !== idx);
                                                                                setBillItems(newItems);
                                                                                setBillForm(prev => ({ ...prev, amount: newItems.reduce((sum, item) => sum + item.total, 0) }));
                                                                            }}
                                                                            className="text-red-500 hover:text-red-700 p-1"
                                                                        >
                                                                            <X size={14} />
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                Total Bill Amount *
                                                {billItems.length === 0 && (
                                                    <span className="ml-2 text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                                                        Enter manually
                                                    </span>
                                                )}
                                                {billItems.length > 0 && (
                                                    <span className="ml-2 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                        Auto-calculated from items
                                                    </span>
                                                )}
                                            </label>
                                            <input
                                                ref={billTotalRef}
                                                onKeyDown={(e) => handleBillKeyDown(e)}
                                                type="number"
                                                required
                                                className={`w-full p-3 border-2 rounded-xl outline-none text-2xl font-bold text-emerald-600 transition-colors ${billItems.length > 0
                                                    ? 'border-emerald-300 bg-emerald-50 focus:border-emerald-500'
                                                    : 'border-blue-300 bg-blue-50 focus:border-blue-500'
                                                    }`}
                                                value={billForm.amount || ''}
                                                onChange={e => setBillForm({ ...billForm, amount: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                                            <input
                                                ref={billDueDateRef}
                                                onKeyDown={(e) => handleBillKeyDown(e)}
                                                type="date"
                                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                                value={billForm.dueDate}
                                                onChange={e => setBillForm({ ...billForm, dueDate: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes / Remarks</label>
                                        <textarea
                                            ref={billNotesRef}
                                            onKeyDown={(e) => handleBillKeyDown(e)}
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none h-[118px]"
                                            placeholder="Add any additional details..."
                                            value={billForm.notes}
                                            onChange={e => setBillForm({ ...billForm, notes: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100 flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsBillModalOpen(false)}
                                        className="flex-1 py-4 text-slate-700 font-bold hover:bg-slate-50 rounded-xl border-2 border-slate-200 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
                                    >
                                        Save Purchase Bill
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* View Bill Modal */}
            {
                isViewBillModalOpen && selectedBill && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setIsViewBillModalOpen(false)}
                        />
                        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h1 className="text-xl font-bold text-slate-800">
                                        Bill Details: {selectedBill.billNumber}
                                    </h1>
                                    <p className="text-sm text-slate-500">
                                        Supplier: {suppliers.find(s => s.id === selectedBill.supplierId)?.name}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => downloadBillPdf(selectedBill)}
                                        disabled={isGeneratingPdf}
                                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-md disabled:bg-emerald-400"
                                    >
                                        {isGeneratingPdf ? 'Generating...' : <><Download size={16} /> Export PDF</>}
                                    </button>
                                    <button onClick={() => setIsViewBillModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Bill Date</p>
                                        <p className="font-medium text-slate-800">{selectedBill.billDate.toLocaleDateString()}</p>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Amount</p>
                                        <p className="font-bold text-slate-800">₹{selectedBill.amount.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                        <p className="text-[10px] text-emerald-600 uppercase font-bold mb-1">Paid Amount</p>
                                        <p className="font-bold text-emerald-700">₹{selectedBill.paidAmount.toLocaleString()}</p>
                                    </div>
                                    <div className={`${selectedBill.balance > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-200'} p-4 rounded-xl border`}>
                                        <p className={`text-[10px] ${selectedBill.balance > 0 ? 'text-red-500' : 'text-slate-500'} uppercase font-bold mb-1`}>Balance</p>
                                        <p className={`font-bold ${selectedBill.balance > 0 ? 'text-red-600' : 'text-slate-800'}`}>₹{selectedBill.balance.toLocaleString()}</p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Bill Items</h3>
                                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                                <tr>
                                                    <th className="p-3 text-left">Product</th>
                                                    <th className="p-3 text-center">Quantity</th>
                                                    <th className="p-3 text-right">Unit Price</th>
                                                    <th className="p-3 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {selectedBill.items?.map((item: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-slate-50/50">
                                                        <td className="p-3 font-medium text-slate-800">{item.productName}</td>
                                                        <td className="p-3 text-center">{Number(item.quantity).toFixed(3)}</td>
                                                        <td className="p-3 text-right text-slate-600">₹{item.unitPrice.toLocaleString()}</td>
                                                        <td className="p-3 text-right font-bold text-slate-800">₹{item.total.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {billAllocations.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Payments History</h3>
                                        <div className="space-y-2">
                                            {billAllocations.map((alloc, idx) => {
                                                const payment = payments.find(p => p.id === alloc.paymentId);
                                                return (
                                                    <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-white p-2 rounded-md shadow-sm border border-slate-100">
                                                                <Wallet size={16} className="text-emerald-600" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-slate-800">
                                                                    {payment?.paymentNumber || 'Initial Adjustment'}
                                                                </p>
                                                                <p className="text-[10px] text-slate-500">
                                                                    {payment ? new Date(payment.paymentDate).toLocaleDateString() : 'N/A'} • {payment?.paymentMode || '-'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <p className="font-bold text-emerald-600">₹{alloc.amount.toLocaleString()}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {selectedBill.notes && (
                                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                                        <p className="text-[10px] text-orange-500 uppercase font-bold mb-1">Notes</p>
                                        <p className="text-sm text-slate-700">{selectedBill.notes}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {/* END PART 2 */}

            {/* Payment Modal */}
            {
                isPaymentModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setIsPaymentModalOpen(false)}
                        />
                        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden z-10">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h2 className="text-xl font-bold text-slate-800">
                                    {editingPayment ? 'Edit Payment' : 'Record Payment'}
                                </h2>
                                <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>
                            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
                                    <SearchableSelect
                                        options={suppliers.filter(s => s.name !== 'Unknown').map(s => ({ ...s, name: `${s.name} (Bal: ₹${s.balance.toLocaleString()})` }))}
                                        value={paymentForm.supplierId}
                                        onChange={(val: string) => setPaymentForm({ ...paymentForm, supplierId: val })}
                                        placeholder="Search Supplier"
                                        className="w-full"
                                        ref={paymentSupplierRef}
                                        onKeyDown={(e: React.KeyboardEvent) => handlePaymentKeyDown(e)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Payment Number *</label>
                                        <input
                                            ref={paymentNumberRef}
                                            onKeyDown={(e) => handlePaymentKeyDown(e)}
                                            type="text"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={paymentForm.paymentNumber}
                                            onChange={e => setPaymentForm({ ...paymentForm, paymentNumber: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
                                        <input
                                            ref={paymentAmountRef}
                                            onKeyDown={(e) => handlePaymentKeyDown(e)}
                                            type="number"
                                            required
                                            min="0"
                                            step="0.01"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-emerald-600"
                                            value={paymentForm.amount || ''}
                                            onChange={e => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
                                        <input
                                            ref={paymentDateRef}
                                            onKeyDown={(e) => handlePaymentKeyDown(e)}
                                            type="date"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={paymentForm.paymentDate}
                                            onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Mode</label>
                                        {/* HIST- payments are synced from Google Sheet ledger — show raw particulars as read-only */}
                                        {editingPayment && editingPayment.id.startsWith('HIST-') ? (
                                            <div className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                                                <p className="text-sm font-medium text-slate-700">
                                                    {editingPayment.notes
                                                        ? editingPayment.notes.replace('Historical: ', '')
                                                        : formatPaymentMode(paymentForm.paymentMode)}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Synced from ledger — mode cannot be changed</p>
                                            </div>
                                        ) : (
                                            <select
                                                ref={paymentModeRef}
                                                onKeyDown={(e) => handlePaymentKeyDown(e)}
                                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium"
                                                value={paymentForm.paymentMode}
                                                onChange={e => setPaymentForm({ ...paymentForm, paymentMode: e.target.value as any })}
                                            >
                                                <option value="CASH">Cash</option>
                                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                                <option value="UPI">UPI</option>
                                                <option value="CHEQUE">Cheque</option>
                                                <option value="OTHER">Other / As per Ledger</option>
                                            </select>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
                                    <input
                                        ref={paymentReferenceRef}
                                        onKeyDown={(e) => handlePaymentKeyDown(e)}
                                        type="text"
                                        placeholder="Txn ID / Cheque No"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={paymentForm.referenceNumber}
                                        onChange={e => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                    <textarea
                                        ref={paymentNotesRef}
                                        onKeyDown={(e) => handlePaymentKeyDown(e)}
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        rows={2}
                                        value={paymentForm.notes}
                                        onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                    />
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsPaymentModalOpen(false)}
                                        className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg border border-slate-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg"
                                    >
                                        {editingPayment ? 'Update Payment' : 'Record Payment'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Statement Modal */}
            {
                isStatementModalOpen && selectedSupplier && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setIsStatementModalOpen(false)}
                        />
                        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden z-10">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h1 className="text-xl font-bold text-slate-800">
                                        Supplier Statement: {selectedSupplier.name}
                                    </h1>
                                    <p className="text-sm text-slate-500">History of bills and payments</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => downloadStatementPdf()}
                                        disabled={isGeneratingPdf}
                                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-md disabled:bg-emerald-400"
                                    >
                                        {isGeneratingPdf ? 'Generating...' : <><Download size={16} /> Export PDF</>}
                                    </button>
                                    <button onClick={() => setIsStatementModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 overflow-y-auto max-h-[70vh]">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <p className="text-xs text-slate-500 uppercase font-semibold">Total Purchases</p>
                                        <p className="text-lg font-bold text-slate-800">
                                            ₹{statementData.reduce((sum, e) => sum + e.debit, 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <p className="text-xs text-slate-500 uppercase font-semibold">Total Paid</p>
                                        <p className="text-lg font-bold text-emerald-600">
                                            ₹{statementData.reduce((sum, e) => sum + e.credit, 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                        <p className="text-xs text-red-500 uppercase font-semibold">Current Balance</p>
                                        <p className="text-lg font-bold text-red-600">₹{(selectedSupplier.balance || 0).toLocaleString()}</p>
                                    </div>
                                </div>

                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-600 font-medium">
                                            <tr>
                                                <th className="p-4 border-b">Date</th>
                                                <th className="p-4 border-b">Type</th>
                                                <th className="p-4 border-b">Reference</th>
                                                <th className="p-4 border-b text-left">Particulars</th>
                                                <th className="p-4 border-b text-right">Debit (+)</th>
                                                <th className="p-4 border-b text-right">Credit (-)</th>
                                                <th className="p-4 border-b text-right bg-slate-100/50">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {statementData.map((entry, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 text-slate-600">{new Date(entry.date).toLocaleDateString()}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${entry.type === 'BILL' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                                                            {entry.type === 'BILL' ? 'BILL' : 'PAYMENT'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 font-mono text-xs">{entry.reference}</td>
                                                    <td className="p-4 text-slate-500 max-w-[200px] truncate" title={entry.notes}>{entry.notes || '-'}</td>
                                                    <td className="p-4 text-right text-slate-800">
                                                        {entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : '-'}
                                                    </td>
                                                    <td className="p-4 text-right text-emerald-600">
                                                        {entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : '-'}
                                                    </td>
                                                    <td className="p-4 text-right font-bold bg-slate-50 text-slate-900 border-l border-slate-100">
                                                        ₹{(entry.balance || 0).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Date Range Modal */}
            {dateRangeModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={() => setDateRangeModal(prev => ({ ...prev, open: false }))}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={e => e.stopPropagation()}>

                        {/* Header */}
                        <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center">
                                    <Download size={18} className="text-white" />
                                </div>
                                <div>
                                    <p className="font-bold text-white text-base">
                                        {dateRangeModal.mode === 'bulk-export' ? 'Export All Statements' : 'Export Statement'}
                                    </p>
                                    <p className="text-slate-400 text-xs">Select date range for PDF generation</p>
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
                                    { id: 'all', icon: <FileText size={22} />, label: 'Complete Statement', sub: 'All historical records' },
                                    { id: 'fy-pick', icon: <Calendar size={22} />, label: 'Financial Year', sub: 'Apr–Mar yearly range' },
                                    { id: 'month-pick', icon: <Clock size={22} />, label: 'By Month', sub: 'Specific month' },
                                    { id: 'custom', icon: <Search size={22} />, label: 'Custom Range', sub: 'Pick start & end date' },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setDateRangeModal(prev => ({ ...prev, range: opt.id as any }))}
                                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center ${
                                            dateRangeModal.range === opt.id
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
                                        }`}
                                    >
                                        <span className={dateRangeModal.range === opt.id ? 'text-emerald-600' : 'text-slate-400'}>{opt.icon}</span>
                                        <span className="font-semibold text-sm leading-tight">{opt.label}</span>
                                        <span className="text-xs text-slate-400">{opt.sub}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Dynamic Sub-fields */}
                            {dateRangeModal.range === 'fy-pick' && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Financial Year</label>
                                    <select
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-sm"
                                        value={dateRangeModal.selectedFY}
                                        onChange={(e) => setDateRangeModal(prev => ({ ...prev, selectedFY: e.target.value }))}
                                    >
                                        {(() => {
                                            const currentYear = new Date().getFullYear();
                                            const startYear = 2022;
                                            const years = Array.from({ length: (currentYear + 15) - startYear + 1 }, (_, i) => startYear + i).reverse();
                                            return years.map(year => (
                                                <option key={year} value={year.toString()}>
                                                    FY {year}–{String(year + 1).slice(-2)}
                                                </option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                            )}

                            {dateRangeModal.range === 'month-pick' && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Month</label>
                                    <input
                                        type="month"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-sm"
                                        value={dateRangeModal.selectedMonth}
                                        onChange={(e) => setDateRangeModal(prev => ({ ...prev, selectedMonth: e.target.value }))}
                                    />
                                </div>
                            )}

                            {dateRangeModal.range === 'custom' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Start Date</label>
                                        <input
                                            type="date"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                            value={dateRangeModal.startDate}
                                            onChange={(e) => setDateRangeModal(prev => ({ ...prev, startDate: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">End Date</label>
                                        <input
                                            type="date"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                            value={dateRangeModal.endDate}
                                            onChange={(e) => setDateRangeModal(prev => ({ ...prev, endDate: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={() => setDateRangeModal(prev => ({ ...prev, open: false }))}
                                    className="flex-1 py-3 font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleBulkExportSuppliersPDF}
                                    disabled={isGeneratingPdf}
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isGeneratingPdf ? (
                                        <><RefreshCw size={16} className="animate-spin" /> Generating...</>
                                    ) : (
                                        <><Download size={16} /> Export All Dealers</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
