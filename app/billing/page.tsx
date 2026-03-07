'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { Dealer, InvoiceItem, Product, CompanySettings, TransactionType } from '@/types';
import { Search, Plus, Trash2, FileText, CheckCircle, Users, ShoppingCart, X, Truck, CreditCard, Printer, MessageSquare, Check, Loader2, Edit } from 'lucide-react';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';

import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PrintableInvoice from '@/components/PrintableInvoice';
import { DEFAULT_COMPANY_SETTINGS } from '@/constants';
import { generateInvoicePDFBase64, generateStatementPDFBase64 } from '@/lib/pdfGenerator';
import { calculateDealerStatement } from '@/lib/utils';
import { getISTDateString } from '@/lib/utils';
import SearchableSelect from '@/components/SearchableSelect';
import { uploadInvoicePDFByMonth, buildInvoiceFileName, uploadToWhatsAppFolder } from '@/lib/googleDriveService';

export default function Billing() {
    const { dealers, products, createInvoice, updateInvoice, addDealer, transactions, isLoading } = useData();
    const router = useRouter();
    const searchParams = useSearchParams();
    const editInvoiceId = searchParams.get('edit');

    const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
    const [generatedRef, setGeneratedRef] = useState<string>('');
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
    const [whatsappSending, setWhatsappSending] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [whatsappError, setWhatsappError] = useState<string | null>(null);
    const [showWhatsAppPreview, setShowWhatsAppPreview] = useState(false);
    const [previewData, setPreviewData] = useState<{ dealer: Dealer; invoiceData: any } | null>(null);
    const [showInvoicePreview, setShowInvoicePreview] = useState(false);
    const [driveUploadStatus, setDriveUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [driveError, setDriveError] = useState<string | null>(null);

    // Printer Dialog State
    const [showPrinterDialog, setShowPrinterDialog] = useState(false);
    const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean; status: number; description: string }[]>([]);
    const [selectedPrinter, setSelectedPrinter] = useState<string>('');
    const [printingStatus, setPrintingStatus] = useState<'idle' | 'loading' | 'printing' | 'done' | 'error'>('idle');
    const [printError, setPrintError] = useState<string | null>(null);

    // Dealer Search
    const [dealerSearch, setDealerSearch] = useState('');
    const [showDealerDropdown, setShowDealerDropdown] = useState(false);
    const [showAddDealerModal, setShowAddDealerModal] = useState(false);
    const [selectedDealerIndex, setSelectedDealerIndex] = useState(0);
    const dealerSearchRef = useRef<HTMLDivElement>(null);
    const dealerDropdownRef = useRef<HTMLDivElement>(null);
    const dealerItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const productSelectRef = useRef<HTMLSelectElement>(null);
    const itemQtyRef = useRef<HTMLInputElement>(null);
    const addItemButtonRef = useRef<HTMLButtonElement>(null);

    // New Dealer Form with City and PinCode
    const [newDealer, setNewDealer] = useState({
        businessName: '',
        contactPerson: '',
        phone: '',
        district: '', // This corresponds to 'State' in UI now
        city: '',
        pinCode: '',
        address: '',
        gstNumber: ''
    });

    // Refs for Enter key navigation in Add Dealer modal
    const dealerBusinessNameRef = useRef<HTMLInputElement>(null);
    const dealerContactPersonRef = useRef<HTMLInputElement>(null);
    const dealerPhoneRef = useRef<HTMLInputElement>(null);
    const dealerCityRef = useRef<HTMLInputElement>(null);
    const dealerDistrictRef = useRef<HTMLInputElement>(null); // State
    const dealerPinCodeRef = useRef<HTMLInputElement>(null);
    const dealerGstRef = useRef<HTMLInputElement>(null);
    const dealerAddressRef = useRef<HTMLTextAreaElement>(null);

    const dealerFieldRefs = [
        dealerBusinessNameRef,
        dealerContactPersonRef,
        dealerPhoneRef,
        dealerCityRef,
        dealerDistrictRef,
        dealerPinCodeRef,
        dealerGstRef,
        dealerAddressRef
    ] as any;
    const { handleKeyDown: handleDealerKeyDown } = useEnterKeyNavigation(dealerFieldRefs);

    // Refs for Enter key navigation in Invoice Form
    const invoiceNoRef = useRef<HTMLInputElement>(null);
    const invoiceDateRef = useRef<HTMLInputElement>(null);
    const dealerSearchInputRef = useRef<HTMLInputElement>(null);
    const vehicleNameRef = useRef<HTMLInputElement>(null);
    const vehicleNumberRef = useRef<HTMLInputElement>(null);
    const destinationRef = useRef<HTMLInputElement>(null);
    const transportChargesRef = useRef<HTMLInputElement>(null);
    const creditDaysRef = useRef<HTMLInputElement>(null);
    const globalDiscountRef = useRef<HTMLInputElement>(null);
    const globalCGSTRef = useRef<HTMLInputElement>(null);
    const globalSGSTRef = useRef<HTMLInputElement>(null);
    const globalIGSTRef = useRef<HTMLInputElement>(null);
    const roundOffRef = useRef<HTMLInputElement>(null);
    const buyerOrderNoRef = useRef<HTMLInputElement>(null);
    const buyerOrderDateRef = useRef<HTMLInputElement>(null);
    const dispatchDocNoRef = useRef<HTMLInputElement>(null);
    const dispatchDateRef = useRef<HTMLInputElement>(null);
    const dispatchThroughRef = useRef<HTMLInputElement>(null);
    const termsOfDeliveryRef = useRef<HTMLInputElement>(null);
    const paymentTermsRef = useRef<HTMLInputElement>(null);
    const deliveryNoteRef = useRef<HTMLInputElement>(null);
    const supplierRefRef = useRef<HTMLInputElement>(null);
    const otherRefRef = useRef<HTMLInputElement>(null);

    const invoiceFieldRefs = [
        vehicleNameRef,
        vehicleNumberRef,
        destinationRef,
        transportChargesRef,
        paymentTermsRef,
        creditDaysRef,
        globalDiscountRef,
        globalCGSTRef,
        globalSGSTRef,
        globalIGSTRef,
        roundOffRef,
        buyerOrderNoRef,
        buyerOrderDateRef,
        dispatchDocNoRef,
        dispatchDateRef,
        deliveryNoteRef,
        supplierRefRef,
        otherRefRef,
        termsOfDeliveryRef
    ] as any;
    const { handleKeyDown: handleInvoiceKeyDown } = useEnterKeyNavigation(invoiceFieldRefs, () => {
        // Enter on last field → create/update the bill
        const btn = document.getElementById('create-bill-btn') as HTMLButtonElement | null;
        btn?.click();
    });

    // Auto-scroll selected dealer into view
    useEffect(() => {
        if (showDealerDropdown && selectedDealerIndex >= 0 && dealerItemRefs.current[selectedDealerIndex]) {
            dealerItemRefs.current[selectedDealerIndex]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }, [selectedDealerIndex, showDealerDropdown]);

    // Product Selection State
    const [itemProduct, setItemProduct] = useState<Product | null>(null);
    const [itemQty, setItemQty] = useState<string>('1');
    const [qtyError, setQtyError] = useState<string | null>(null);

    // Transport & Invoice Details
    const [vehicleName, setVehicleName] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [destination, setDestination] = useState('');
    const [transportCharges, setTransportCharges] = useState<string>('0');
    const [paymentTerms, setPaymentTerms] = useState('Immediate'); // Cash, Cheque, Credit
    const [globalDiscount, setGlobalDiscount] = useState<string>('0');
    const [globalCGST, setGlobalCGST] = useState<string>('0');
    const [globalSGST, setGlobalSGST] = useState<string>('0');
    const [globalIGST, setGlobalIGST] = useState<string>('0');
    const [roundOff, setRoundOff] = useState<string>('0');
    const [creditDays, setCreditDays] = useState<string>('30');

    // New Fields for Invoice
    const [buyerOrderNo, setBuyerOrderNo] = useState('');
    const [buyerOrderDate, setBuyerOrderDate] = useState('');
    const [dispatchDocNo, setDispatchDocNo] = useState('');
    const [dispatchDate, setDispatchDate] = useState('');
    const [termsOfDelivery, setTermsOfDelivery] = useState('');
    const [deliveryNote, setDeliveryNote] = useState('');
    const [supplierRef, setSupplierRef] = useState('');
    const [otherRef, setOtherRef] = useState('');

    // Invoice Number Manual Entry
    const [manualInvoiceNo, setManualInvoiceNo] = useState('');

    // Invoice Date
    const [invoiceDate, setInvoiceDate] = useState(getISTDateString());
    const [invoiceNoExists, setInvoiceNoExists] = useState(false);

    const checkInvoiceNumberExists = (no: string) => {
        const exists = transactions.some(t =>
            t.type === 'INVOICE' &&
            t.id !== editInvoiceId &&
            (t.referenceId === `INV${no}` ||
                (t.notes && (() => {
                    try {
                        const n = JSON.parse(t.notes);
                        return n.manualInvoiceNo === no;
                    } catch { return false; }
                })()))
        );
        setInvoiceNoExists(exists);
    };

    // Initialize Manual Invoice Number
    const isInvoiceInitialized = useRef(false);
    useEffect(() => {
        // Reset when switching between new/edit invoice
        if (editInvoiceId) {
            isInvoiceInitialized.current = false;
            return; // editing: number is loaded from the existing invoice
        }
        if (isInvoiceInitialized.current) return;

        // Wait until DataContext has finished loading (isLoading = false)
        // This ensures we read the true DB count, not a stale cache count
        if (isLoading) return;

        const invoiceCount = transactions.filter(t => t.type === 'INVOICE').length;
        setManualInvoiceNo(String(invoiceCount + 1).padStart(3, '0'));
        isInvoiceInitialized.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions, editInvoiceId, isLoading]);

    // Load Company Settings
    // Load Company Settings
    useEffect(() => {
        const loadCompanySettings = async () => {
            try {
                const { data, error } = await supabase
                    .from('company_settings')
                    .select('*')
                    .limit(1);

                if (error) {
                    console.error('Error loading company settings from DB:', error);
                    // Fallback to default settings
                    setCompanySettings(DEFAULT_COMPANY_SETTINGS);
                } else if (data && data.length > 0) {
                    const settings = data[0];
                    setCompanySettings({
                        id: settings.id,
                        companyName: settings.company_name,
                        addressLine1: settings.address_line1,
                        addressLine2: settings.address_line2,
                        city: settings.city,
                        state: settings.state,
                        pinCode: settings.pin_code,
                        gstNumber: settings.gst_number,
                        panNumber: settings.pan_number,
                        phone: settings.phone,
                        email: settings.email,
                        bankName: settings.bank_name,
                        bankBranch: settings.bank_branch,
                        accountNumber: settings.account_number,
                        ifscCode: settings.ifsc_code,
                        accountHolderName: settings.account_holder_name
                    });
                } else {
                    console.warn('No company settings found in DB, using defaults');
                    setCompanySettings(DEFAULT_COMPANY_SETTINGS);
                }
            } catch (err) {
                console.error('Exception loading company settings:', err);
                setCompanySettings(DEFAULT_COMPANY_SETTINGS);
            }
        };

        loadCompanySettings();
    }, []);


    const generatedInvoiceNumber = `INV${manualInvoiceNo}`;

    // Load Invoice for Editing
    useEffect(() => {
        const loadInvoice = async () => {
            if (!editInvoiceId) return;

            const txn = transactions.find(t => t.id === editInvoiceId);
            if (!txn) return;

            // Set Dealer
            const dealer = dealers.find(d => d.id === txn.customerId);
            if (dealer) setSelectedDealer(dealer);

            // Set Meta Details
            setVehicleName(txn.vehicleName || '');
            setVehicleNumber(txn.vehicleNumber || '');
            setDestination(txn.destination || '');
            setTransportCharges(String(txn.transportCharges || 0));
            setPaymentTerms(txn.paymentTerms || 'Immediate');
            setGlobalDiscount(String(txn.discountPercent || 0));
            setCreditDays(String(txn.creditDays || 30));

            // Set Invoice Date
            if (txn.date) {
                setInvoiceDate(new Date(txn.date).toISOString().split('T')[0]);
            }

            // Parse Notes for additional fields (only if it looks like JSON)
            if (txn.notes && txn.notes.trim().startsWith('{')) {
                try {
                    const notes = JSON.parse(txn.notes);
                    setBuyerOrderNo(notes.buyerOrderNo || '');
                    setBuyerOrderDate(notes.buyerOrderDate || '');
                    setDispatchDocNo(notes.dispatchDocNo || '');
                    setDispatchDate(notes.dispatchDate || '');
                    setDeliveryNote(notes.deliveryNote || '');
                    setSupplierRef(notes.supplierRef || '');
                    setOtherRef(notes.otherRef || '');
                    setTermsOfDelivery(notes.termsOfDelivery || '');
                    // setDispatchThrough(notes.dispatchThrough || '');
                    setRoundOff(notes.roundOff || '0');
                    setGlobalCGST(notes.globalCGST || '0');
                    setGlobalSGST(notes.globalSGST || '0');
                    setGlobalIGST(notes.globalIGST || '0');

                    if (notes.manualInvoiceNo) {
                        setManualInvoiceNo(notes.manualInvoiceNo);
                        isInvoiceInitialized.current = true;
                    }
                } catch (e) {
                    console.warn('[Billing] Note exists but is not valid JSON (metadata parse):', e);
                }
            }

            // Load Items from notes JSON (primary storage, only if it looks like JSON)
            if (txn.notes && txn.notes.trim().startsWith('{')) {
                try {
                    const notes = JSON.parse(txn.notes);
                    if (notes.invoiceItems && notes.invoiceItems.length > 0) {
                        setInvoiceItems(notes.invoiceItems.map((item: any) => ({
                            productId: item.productId,
                            productName: item.productName,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            cgst: item.cgst,
                            sgst: item.sgst,
                            igst: item.igst,
                            cgstAmount: item.cgstAmount,
                            sgstAmount: item.sgstAmount,
                            igstAmount: item.igstAmount,
                            discount: item.discount,
                            discountAmount: item.discountAmount,
                            total: item.total,
                            gstAmount: item.gstAmount || (item.cgstAmount + item.sgstAmount + item.igstAmount),
                            hsnCode: item.hsnCode,
                            unit: item.unit,
                            gstRate: item.gstRate || (item.cgst + item.sgst + item.igst)
                        })));
                    }
                } catch (e) {
                    console.warn('[Billing] Note exists but is not valid JSON (items parse):', e);
                }
            }

            // Fallback: use items from context state (if loaded from invoice_items table)
            if (invoiceItems.length === 0 && txn.items && txn.items.length > 0) {
                setInvoiceItems(txn.items.map(item => ({
                    ...item,
                    gstAmount: item.gstAmount || (item.cgstAmount + item.sgstAmount + item.igstAmount),
                    gstRate: item.gstRate || (item.cgst + item.sgst + item.igst)
                })));
            }
        };

        if (dealers.length > 0 && transactions.length > 0) {
            loadInvoice();
        }
    }, [editInvoiceId, dealers, transactions]);

    // --- Draft Persistence ---
    const DRAFT_KEY = 'bill_draft_data';

    // Load Draft on Mount
    useEffect(() => {
        if (editInvoiceId) return; // Don't load draft if editing an existing invoice

        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (savedDraft) {
            try {
                const draft = JSON.parse(savedDraft);

                // Only load if it's not too old (optional, e.g., 1 day)
                const draftAge = Date.now() - (draft.timestamp || 0);
                if (draftAge < 24 * 60 * 60 * 1000) {
                    if (draft.selectedDealer) setSelectedDealer(draft.selectedDealer);
                    if (draft.invoiceItems) setInvoiceItems(draft.invoiceItems);
                    if (draft.invoiceDate) setInvoiceDate(draft.invoiceDate);
                    if (draft.manualInvoiceNo) setManualInvoiceNo(draft.manualInvoiceNo);
                    if (draft.vehicleName) setVehicleName(draft.vehicleName);
                    if (draft.vehicleNumber) setVehicleNumber(draft.vehicleNumber);
                    if (draft.destination) setDestination(draft.destination);
                    if (draft.transportCharges) setTransportCharges(draft.transportCharges);
                    if (draft.paymentTerms) setPaymentTerms(draft.paymentTerms);
                    if (draft.globalDiscount) setGlobalDiscount(draft.globalDiscount);
                    if (draft.globalCGST) setGlobalCGST(draft.globalCGST);
                    if (draft.globalSGST) setGlobalSGST(draft.globalSGST);
                    if (draft.globalIGST) setGlobalIGST(draft.globalIGST);
                    if (draft.roundOff) setRoundOff(draft.roundOff);
                    if (draft.buyerOrderNo) setBuyerOrderNo(draft.buyerOrderNo);
                    if (draft.buyerOrderDate) setBuyerOrderDate(draft.buyerOrderDate);
                    if (draft.dispatchDocNo) setDispatchDocNo(draft.dispatchDocNo);
                    if (draft.dispatchDate) setDispatchDate(draft.dispatchDate);
                    if (draft.termsOfDelivery) setTermsOfDelivery(draft.termsOfDelivery);
                    if (draft.deliveryNote) setDeliveryNote(draft.deliveryNote);
                    if (draft.supplierRef) setSupplierRef(draft.supplierRef);
                    if (draft.otherRef) setOtherRef(draft.otherRef);
                }
            } catch (e) {
                console.error('Failed to load invoice draft', e);
            }
        }
    }, [editInvoiceId]);

    // Save Draft on Change
    useEffect(() => {
        if (editInvoiceId) return; // Don't save draft if editing

        const draftData = {
            selectedDealer,
            invoiceItems,
            invoiceDate,
            manualInvoiceNo,
            vehicleName,
            vehicleNumber,
            destination,
            transportCharges,
            paymentTerms,
            globalDiscount,
            globalCGST,
            globalSGST,
            globalIGST,
            roundOff,
            buyerOrderNo,
            buyerOrderDate,
            dispatchDocNo,
            dispatchDate,
            deliveryNote,
            supplierRef,
            otherRef,
            termsOfDelivery,
            timestamp: Date.now()
        };

        const timer = setTimeout(() => {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
        }, 1000); // Debounce saves

        return () => clearTimeout(timer);
    }, [
        selectedDealer, invoiceItems, invoiceDate, manualInvoiceNo,
        vehicleName, vehicleNumber, destination, transportCharges,
        paymentTerms, globalDiscount, globalCGST, globalSGST, globalIGST,
        roundOff, buyerOrderNo, buyerOrderDate, dispatchDocNo,
        dispatchDate, deliveryNote, supplierRef, otherRef, termsOfDelivery, editInvoiceId
    ]);

    const clearDraft = () => {
        localStorage.removeItem(DRAFT_KEY);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dealerSearchRef.current && !dealerSearchRef.current.contains(event.target as Node)) {
                setShowDealerDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter dealers based on search
    const filteredDealers = dealers.filter(d =>
        d.businessName.toLowerCase().includes(dealerSearch.toLowerCase()) ||
        d.contactPerson.toLowerCase().includes(dealerSearch.toLowerCase()) ||
        d.phone.includes(dealerSearch) ||
        d.city?.toLowerCase().includes(dealerSearch.toLowerCase())
    );

    // Live stock tracking: qty reserved by items already in this invoice
    const reservedStock = useMemo(() => {
        const map: Record<string, number> = {};
        invoiceItems.forEach(item => {
            map[item.productId] = (map[item.productId] || 0) + item.quantity;
        });
        return map;
    }, [invoiceItems]);

    // Memoized Calculations — prevents re-running reduce on every keystroke
    const { subTotal, totalTax, totalDiscount } = useMemo(() => ({
        subTotal: invoiceItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0),
        totalTax: invoiceItems.reduce((acc, item) => acc + item.cgstAmount + item.sgstAmount + item.igstAmount, 0),
        totalDiscount: invoiceItems.reduce((acc, item) => acc + item.discountAmount, 0),
    }), [invoiceItems]);

    const globalDiscountAmount = useMemo(() => (subTotal * parseFloat(globalDiscount || '0')) / 100, [subTotal, globalDiscount]);
    const globalCGSTAmount = useMemo(() => (subTotal * parseFloat(globalCGST || '0')) / 100, [subTotal, globalCGST]);
    const globalSGSTAmount = useMemo(() => (subTotal * parseFloat(globalSGST || '0')) / 100, [subTotal, globalSGST]);
    const globalIGSTAmount = useMemo(() => (subTotal * parseFloat(globalIGST || '0')) / 100, [subTotal, globalIGST]);

    const roundOffAmount = useMemo(() => parseFloat(roundOff || '0'), [roundOff]);

    // Helper: round a value to exactly 2 decimal places to avoid JS floating-point drift
    // e.g. 657.14 + 16.43 + 16.43 + 14.50 = 704.4999999... → rounds to 704.50
    const r2 = (v: number) => Math.round(v * 100) / 100;

    // Product-level totalTax is excluded from invoice total — only global GST counts
    const invoiceTotal = useMemo(() => {
        const raw = subTotal - totalDiscount - globalDiscountAmount +
            globalCGSTAmount + globalSGSTAmount + globalIGSTAmount +
            parseFloat(transportCharges || '0') + roundOffAmount;
        return r2(raw);
    }, [subTotal, totalDiscount, globalDiscountAmount, globalCGSTAmount, globalSGSTAmount, globalIGSTAmount, transportCharges, roundOffAmount]);

    const previousBalance = selectedDealer ? r2(selectedDealer.balance) : 0;
    const grandTotal = r2(invoiceTotal + previousBalance);

    const handleAddItem = useCallback(() => {
        if (!itemProduct || !selectedDealer) return;

        const qty = parseFloat(itemQty) || 1;

        // Check available stock (total stock minus what's already in this invoice)
        const alreadyReserved = reservedStock[itemProduct.id] || 0;
        const availableStock = itemProduct.stock - alreadyReserved;
        if (qty > availableStock) {
            setQtyError(`Only ${availableStock} available`);
            itemQtyRef.current?.focus();
            itemQtyRef.current?.select();
            return;
        }
        setQtyError(null);

        // State Detection for GST calculation
        // - Kerala dealers: CGST + IGST (split by 2)
        // - All other states (including Tamil Nadu): CGST + SGST (split by 2)
        const dealerState = (selectedDealer.state || selectedDealer.district || selectedDealer.address || '').toLowerCase();
        const isKerala = dealerState.includes('kerala') || dealerState.includes('kl');

        // Products store GST as decimal (0.18 for 18%), convert to percentage
        const gstRatePercentage = itemProduct.gstRate < 1 ? itemProduct.gstRate * 100 : itemProduct.gstRate; // e.g., 18
        let cgst = 0, sgst = 0, igst = 0;

        if (isKerala) {
            // For Kerala dealers (inter-state): Use CGST + IGST (split the rate)
            cgst = gstRatePercentage / 2;  // e.g., 9%
            igst = gstRatePercentage / 2;  // e.g., 9%
        } else {
            // For all other states (intra-state): Use CGST + SGST (split the rate)
            cgst = gstRatePercentage / 2;  // e.g., 9%
            sgst = gstRatePercentage / 2;  // e.g., 9%
        }

        const baseAmount = itemProduct.price * qty;
        const cgstAmount = (baseAmount * cgst) / 100;
        const sgstAmount = (baseAmount * sgst) / 100;
        const igstAmount = (baseAmount * igst) / 100;
        // Product GST is only for taxable summary / HSN reference, NOT added to line total
        const total = baseAmount;

        const newItem: InvoiceItem = {
            productId: itemProduct.id,
            productName: itemProduct.name,
            quantity: qty,
            unitPrice: itemProduct.price,
            costPrice: itemProduct.costPrice || 0,   // Snapshot cost price at billing time
            cgst: cgst,
            sgst: sgst,
            igst: igst,
            cgstAmount: cgstAmount,
            sgstAmount: sgstAmount,
            igstAmount: igstAmount,
            discount: 0,
            discountAmount: 0,
            total: total,
            hsnCode: itemProduct.hsnCode,
            unit: itemProduct.unit,
            gstRate: gstRatePercentage
        };

        setInvoiceItems([...invoiceItems, newItem]);
        setItemProduct(null);
        setItemQty('1');

        // Focus back to product select for next entry
        setTimeout(() => productSelectRef.current?.focus(), 100);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itemProduct, itemQty, invoiceItems, selectedDealer]);


    const handleRemoveItem = useCallback((index: number) => {
        const newItems = [...invoiceItems];
        newItems.splice(index, 1);
        setInvoiceItems(newItems);
    }, [invoiceItems]);

    const handleUpdateItemTax = useCallback((index: number, field: 'cgst' | 'sgst' | 'igst' | 'discount', value: string) => {
        const newItems = [...invoiceItems];
        const item = newItems[index];
        const numValue = parseFloat(value) || 0;

        item[field] = numValue;

        // Recalculate amounts
        const baseAmount = item.unitPrice * item.quantity;
        item.cgstAmount = (baseAmount * item.cgst) / 100;
        item.sgstAmount = (baseAmount * item.sgst) / 100;
        item.igstAmount = (baseAmount * item.igst) / 100;
        item.discountAmount = (baseAmount * item.discount) / 100;
        // Product GST is for taxable summary only — not added to line total
        item.total = baseAmount - item.discountAmount;

        setInvoiceItems(newItems);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoiceItems]);

    const handleUpdateItemQty = useCallback((index: number, value: string) => {
        // Allow empty string for typing
        if (value === '') {
            const newItems = [...invoiceItems];
            newItems[index].quantity = 0;
            setInvoiceItems(newItems);
            return;
        }

        const qty = parseFloat(value);
        if (isNaN(qty) || qty < 0) return;

        const newItems = [...invoiceItems];
        const item = newItems[index];
        item.quantity = qty;

        // Recalculate amounts
        const baseAmount = item.unitPrice * qty;
        item.cgstAmount = (baseAmount * item.cgst) / 100;
        item.sgstAmount = (baseAmount * item.sgst) / 100;
        item.igstAmount = (baseAmount * item.igst) / 100;
        item.discountAmount = (baseAmount * item.discount) / 100;
        // Product GST is for taxable summary only — not added to line total
        item.total = baseAmount - item.discountAmount;

        setInvoiceItems(newItems);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoiceItems]);

    const handleCreateBill = async () => {
        if (!selectedDealer || invoiceItems.length === 0) return;
        if (invoiceNoExists) {
            alert('Invoice number already exists. Please use a unique number.');
            return;
        }

        setIsSubmitting(true);
        await new Promise(resolve => setTimeout(resolve, 1500));

        if (editInvoiceId) {
            await updateInvoice(editInvoiceId, invoiceItems, invoiceTotal, {
                vehicleName,
                vehicleNumber,
                destination,
                transportCharges: parseFloat(transportCharges) || 0,
                paymentTerms,
                discountPercent: parseFloat(globalDiscount) || 0,
                creditDays: parseInt(creditDays) || 30,
                notes: JSON.stringify({
                    buyerOrderNo,
                    buyerOrderDate,
                    dispatchDocNo,
                    dispatchDate,
                    deliveryNote,
                    supplierRef,
                    otherRef,
                    termsOfDelivery,
                    manualInvoiceNo,
                    roundOff,
                    globalCGST,
                    globalSGST,
                    globalIGST,
                    invoiceItems: invoiceItems.map(item => ({
                        productId: item.productId,
                        productName: item.productName,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        costPrice: item.costPrice || 0,
                        cgst: item.cgst,
                        sgst: item.sgst,
                        igst: item.igst,
                        cgstAmount: item.cgstAmount,
                        sgstAmount: item.sgstAmount,
                        igstAmount: item.igstAmount,
                        discount: item.discount,
                        discountAmount: item.discountAmount,
                        total: item.total,
                        gstAmount: item.gstAmount,
                        hsnCode: item.hsnCode,
                        unit: item.unit,
                        gstRate: item.gstRate
                    }))
                })
            });
            // For update, we might want to just show success and then redirect back or stay
            // Here reusing generatedRef as the existing ID
            setGeneratedRef(transactions.find(t => t.id === editInvoiceId)?.referenceId || 'UPDATED');
            setCreatedInvoiceId(editInvoiceId);
        } else {
            const { id, refId } = await createInvoice(selectedDealer.id, invoiceItems, invoiceTotal, {
                vehicleName,
                vehicleNumber,
                destination,
                transportCharges: parseFloat(transportCharges) || 0,
                paymentTerms,
                discountPercent: parseFloat(globalDiscount) || 0,
                creditDays: parseInt(creditDays) || 30,
                invoiceDate: new Date(invoiceDate),
                // Add new fields to referenceId logic manually if needed, 
                // but createInvoice doesn't take them as args directly in existing signature.
                // We should update createInvoice signature OR pass them in metadata/notes if we don't want to change schema too much.
                // However, user wants them on PRINT.
                // I will add them to a 'meta' object if createInvoice supports it, or just rely on them being state for now 
                // and we might need to save them to notes or a new jsonb column if we want persistence.
                // For now, let's assume we just need to print them. But persistence is better.
                // Since I haven't added columns for these, I'll put them in 'notes' as JSON string for now as a quick hack 
                // OR add columns. I should have added columns to transactions table.
                // NOTES HACK for now:
                notes: JSON.stringify({
                    buyerOrderNo,
                    buyerOrderDate,
                    dispatchDocNo,
                    dispatchDate,
                    deliveryNote,
                    supplierRef,
                    otherRef,
                    termsOfDelivery,
                    manualInvoiceNo,
                    roundOff,
                    globalCGST,
                    globalSGST,
                    globalIGST,
                    invoiceItems: invoiceItems.map(item => ({
                        productId: item.productId,
                        productName: item.productName,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        costPrice: item.costPrice || 0,
                        cgst: item.cgst,
                        sgst: item.sgst,
                        igst: item.igst,
                        cgstAmount: item.cgstAmount,
                        sgstAmount: item.sgstAmount,
                        igstAmount: item.igstAmount,
                        discount: item.discount,
                        discountAmount: item.discountAmount,
                        total: item.total,
                        gstAmount: item.gstAmount,
                        hsnCode: item.hsnCode,
                        unit: item.unit,
                        gstRate: item.gstRate
                    }))
                })
            });
            setGeneratedRef((manualInvoiceNo ? `INV${manualInvoiceNo}` : refId));
            setCreatedInvoiceId(id);
        }

        // Real-time Sync to Google Sheets (disabled — month-wise Drive storage is used instead)
        // syncInvoiceToSheets has been removed as ERP Invoices tab is no longer needed.

        // --- AUTOMATIC PDF BACKUP TO GOOGLE DRIVE ---
        if (companySettings && selectedDealer) {
            // Background process to avoid blocking UI success screen
            (async () => {
                try {
                    const invoiceData = {
                        id: (editInvoiceId || 'NEW'),
                        customerId: selectedDealer.id,
                        type: TransactionType.INVOICE,
                        amount: invoiceTotal,
                        date: new Date(invoiceDate),
                        referenceId: (manualInvoiceNo ? `INV${manualInvoiceNo}` : (editInvoiceId || 'NEW')),
                        items: invoiceItems,
                        vehicleName,
                        vehicleNumber,
                        destination,
                        transportCharges: parseFloat(transportCharges) || 0,
                        paymentTerms,
                        discountPercent: parseFloat(globalDiscount) || 0,
                        creditDays: parseInt(creditDays) || 30,
                        notes: JSON.stringify({
                            buyerOrderNo, buyerOrderDate, dispatchDocNo, dispatchDate,
                            deliveryNote, supplierRef, otherRef, termsOfDelivery,
                            manualInvoiceNo, roundOff, globalCGST, globalSGST, globalIGST
                        })
                    };

                    const invoiceBase64 = await generateInvoicePDFBase64(
                        invoiceData as any,
                        selectedDealer!,
                        invoiceItems,
                        companySettings
                    );

                    const driveFileName = buildInvoiceFileName(
                        invoiceData.referenceId,
                        selectedDealer!.businessName,
                        new Date(invoiceDate) // use invoice date → correct month folder
                    );

                    console.log('[Billing] Starting automatic Drive upload:', driveFileName);
                    // Upload to ERP Invoices / {Month YYYY} / filename.pdf
                    await uploadInvoicePDFByMonth(
                        invoiceBase64,
                        driveFileName,
                        new Date(invoiceDate)
                    );
                    console.log('[Billing] Automatic Drive upload success (month-wise)!');
                } catch (driveErr) {
                    console.error('[Billing] Automatic Drive upload failed:', driveErr);
                }
            })();
        }

        setIsSubmitting(false);
        setShowSuccess(true);
        clearDraft(); // Clear draft only on success

        // Prepare data for WhatsApp Preview instead of sending automatically
        if (selectedDealer && selectedDealer.phone) {
            const invoiceData = {
                id: editInvoiceId || '',
                customerId: selectedDealer.id,
                type: TransactionType.INVOICE,
                amount: invoiceTotal,
                date: new Date(invoiceDate),
                referenceId: (manualInvoiceNo ? `INV${manualInvoiceNo}` : 'TMP'),
                items: invoiceItems,
                vehicleName,
                vehicleNumber,
                destination,
                transportCharges: parseFloat(transportCharges) || 0,
                paymentTerms,
                discountPercent: parseFloat(globalDiscount) || 0,
                creditDays: parseInt(creditDays) || 30,
                notes: JSON.stringify({
                    buyerOrderNo,
                    buyerOrderDate,
                    dispatchDocNo,
                    dispatchDate,
                    deliveryNote,
                    supplierRef,
                    otherRef,
                    termsOfDelivery,
                    manualInvoiceNo,
                    roundOff,
                    globalCGST,
                    globalSGST,
                    globalIGST
                })
            };
            setPreviewData({ dealer: selectedDealer, invoiceData });
            setShowWhatsAppPreview(true);
        }
    };

    const handleSendWhatsApp = async (dealer: Dealer, invoiceData: any) => {
        if (!companySettings) return;

        setWhatsappSending('sending');
        setWhatsappError(null);

        try {
            if (window.electron?.whatsapp?.getStatus) {
                const status = await window.electron.whatsapp.getStatus();
                if (status !== 'READY') {
                    throw new Error('WhatsApp is not connected. Please go to Settings to link your account.');
                }
            }

            // 1. Generate Invoice PDF
            const invoiceBase64 = await generateInvoicePDFBase64(
                invoiceData,
                dealer,
                invoiceItems,
                companySettings
            );

            // 2. Generate Statement PDF
            // Ensure the newly created invoice is included in the statement calculation
            const filteredTxns = transactions.filter(t => t.customerId === dealer.id);
            // Check if context already has this invoice to avoid duplication
            const alreadyIncluded = filteredTxns.some(t =>
                (t.referenceId === invoiceData.referenceId && t.referenceId !== 'TMP') ||
                (t.id === invoiceData.id && t.id !== '')
            );

            const dealerTransactions = alreadyIncluded ? filteredTxns : [...filteredTxns, invoiceData];
            const { invoices: stmtInvoices, payments: stmtPayments } = calculateDealerStatement(dealerTransactions);

            // Calculate summary for statement
            const totalInvoiced = stmtInvoices.reduce((sum, inv) => sum + inv.amount, 0);
            const totalPaid = stmtPayments.reduce((sum, p) => sum + p.amount, 0);
            const totalOutstanding = totalInvoiced - totalPaid;

            const statementBase64 = await generateStatementPDFBase64(
                dealer,
                stmtInvoices,
                stmtPayments,
                companySettings,
                { totalInvoiced, totalPaid, totalOutstanding }
            );

            // 3. Send Invoice
            if (window.electron?.whatsapp?.sendPDF) {
                await window.electron.whatsapp.sendPDF(
                    dealer.phone,
                    invoiceBase64,
                    `Invoice_${invoiceData.referenceId}.pdf`,
                    `Hello ${dealer.businessName}, please find your invoice ${invoiceData.referenceId} for ₹${invoiceData.amount.toLocaleString()}. Thank you for your business!`
                );
            } else {
                // WEB FALLBACK: Upload to Drive and share Link
                try {
                    setWhatsappSending('sending');
                    const link = await uploadToWhatsAppFolder(invoiceBase64, `Invoice_${invoiceData.referenceId}.pdf`);
                    const message = `Hello ${dealer.businessName}, please find your invoice ${invoiceData.referenceId} for ₹${invoiceData.amount.toLocaleString()}. \n\nView Invoice: ${link}`;
                    const whatsappUrl = `https://wa.me/${dealer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
                    window.open(whatsappUrl, '_blank');
                    // Small delay to simulate sending
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (err: any) {
                    console.error('Web WhatsApp share failed:', err);
                    // Fallback to text only if drive fails
                    const message = `Hello ${dealer.businessName}, please find your invoice ${invoiceData.referenceId} for ₹${invoiceData.amount.toLocaleString()}.`;
                    const whatsappUrl = `https://wa.me/${dealer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
                    window.open(whatsappUrl, '_blank');
                }
            }

            // Small delay between documents
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 4. Send Statement
            if (window.electron?.whatsapp?.sendPDF) {
                await window.electron.whatsapp.sendPDF(
                    dealer.phone,
                    statementBase64,
                    `Statement_${dealer.businessName.replace(/\s+/g, '_')}.pdf`,
                    `Hello ${dealer.businessName}, please find your current account statement. Total Outstanding: ₹${totalOutstanding.toLocaleString()}.`
                );
            } else {
                // WEB FALLBACK: Send Statement Link
                try {
                    const stmtLink = await uploadToWhatsAppFolder(statementBase64, `Statement_${dealer.businessName.replace(/\s+/g, '_')}.pdf`);
                    const msg = `Hello ${dealer.businessName}, please find your account statement. Total Outstanding: ₹${totalOutstanding.toLocaleString()}. \n\nView Statement: ${stmtLink}`;
                    const waUrl = `https://wa.me/${dealer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
                    window.open(waUrl, '_blank');
                } catch (e) {
                    console.warn('Web statement share failed:', e);
                }
                setWhatsappSending('success');
            }

            setWhatsappSending('success');
            setTimeout(() => setWhatsappSending('idle'), 5000);

            // 5. Success
            setWhatsappSending('success');
            setTimeout(() => setWhatsappSending('idle'), 5000);
        } catch (err: any) {
            console.error('WhatsApp send failed', err);
            setWhatsappSending('error');
            setWhatsappError(err.message || 'Failed to send WhatsApp message');
        }
    };

    // ══════════════════════════════════════════
    // Cheque Return State & Handler
    // ══════════════════════════════════════════
    const [showChequeReturnModal, setShowChequeReturnModal] = useState(false);
    const [crDealer, setCrDealer] = useState<Dealer | null>(null);
    const [crDealerSearch, setCrDealerSearch] = useState('');
    const [crChequeNo, setCrChequeNo] = useState('');
    const [crAmount, setCrAmount] = useState('');
    const [crReason, setCrReason] = useState('Insufficient Funds');
    const [crProcessing, setCrProcessing] = useState(false);
    const [crSuccess, setCrSuccess] = useState(false);
    const crChequeNoRef = useRef<HTMLInputElement>(null);
    const crAmountRef = useRef<HTMLInputElement>(null);
    const crReasonRef = useRef<HTMLSelectElement>(null);
    const crSubmitRef = useRef<HTMLButtonElement>(null);

    const filteredCrDealers = dealers.filter(d =>
        d.businessName.toLowerCase().includes(crDealerSearch.toLowerCase())
    );

    const handleChequeReturn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!crDealer || !crAmount) return;
        const amountNum = parseFloat(crAmount);
        if (isNaN(amountNum) || amountNum <= 0) return;

        setCrProcessing(true);
        try {
            const refNote = crChequeNo ? ` (Cheque No: ${crChequeNo})` : '';
            const noteText = `Cheque Return${refNote} – Reason: ${crReason}`;

            // Create invoice to increase balance
            const { refId: newInvoiceRef } = await createInvoice(
                crDealer.id,
                [],
                amountNum,
                { notes: noteText } as any
            );

            // Sync to Google Sheets ERP Payments (global list)
            try {
                const { syncPaymentToSheets } = await import('@/lib/googleSheetWriter');
                await syncPaymentToSheets(
                    crDealer.businessName,
                    newInvoiceRef,
                    -amountNum, // negative so it shows as debit/bounced
                    'Cheque Return',
                    'System'
                );
            } catch (syncErr) {
                console.warn('[Billing] Cheque Return sheet sync failed:', syncErr);
            }

            // Send WhatsApp statement with updated balance
            if (companySettings && crDealer.phone) {
                try {
                    const status = window.electron?.whatsapp?.getStatus
                        ? await window.electron.whatsapp.getStatus()
                        : 'READY';

                    if (status === 'READY') {
                        // Build cheque-return transaction entry for the statement
                        const crTxn = {
                            id: 'cr-tmp',
                            customerId: crDealer.id,
                            type: TransactionType.INVOICE,
                            amount: amountNum,
                            date: new Date(),
                            referenceId: newInvoiceRef,
                            notes: noteText
                        };
                        const filteredTxns = transactions.filter(t => t.customerId === crDealer.id);
                        const dealerTxns = [...filteredTxns, crTxn];
                        const { invoices: stmtInvoices, payments: stmtPayments } = calculateDealerStatement(dealerTxns);
                        const totalInvoiced = stmtInvoices.reduce((s, i) => s + i.amount, 0);
                        const totalPaid = stmtPayments.reduce((s, p) => s + p.amount, 0);
                        const totalOutstanding = totalInvoiced - totalPaid;

                        const statementBase64 = await generateStatementPDFBase64(
                            crDealer,
                            stmtInvoices,
                            stmtPayments,
                            companySettings,
                            { totalInvoiced, totalPaid, totalOutstanding }
                        );

                        const msg = `Hello ${crDealer.businessName}, a cheque return of ₹${amountNum.toLocaleString()} has been recorded${refNote ? ` for ${crChequeNo}` : ''}. Your updated outstanding balance is ₹${totalOutstanding.toLocaleString()}.`;

                        if (window.electron?.whatsapp?.sendPDF) {
                            await window.electron.whatsapp.sendPDF(
                                crDealer.phone,
                                statementBase64,
                                `Statement_${crDealer.businessName.replace(/\s+/g, '_')}.pdf`,
                                msg + " Please find the account statement attached."
                            );
                        } else {
                            // WEB FALLBACK: Upload statement to Drive and share link
                            try {
                                const stmtLink = await uploadToWhatsAppFolder(statementBase64, `Statement_${crDealer.businessName.replace(/\s+/g, '_')}.pdf`);
                                const whatsappUrl = `https://wa.me/${crDealer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg + "\n\nView Statement: " + stmtLink)}`;
                                window.open(whatsappUrl, '_blank');
                            } catch (e) {
                                console.warn('Web cheque-return statement share failed:', e);
                                const whatsappUrl = `https://wa.me/${crDealer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg + " (Statement available in office)")}`;
                                window.open(whatsappUrl, '_blank');
                            }
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                } catch (waErr) {
                    console.warn('[Billing] Cheque Return WhatsApp send failed:', waErr);
                }
            }

            setCrSuccess(true);
            setTimeout(() => {
                setShowChequeReturnModal(false);
                setCrSuccess(false);
                setCrDealer(null);
                setCrDealerSearch('');
                setCrChequeNo('');
                setCrAmount('');
                setCrReason('Insufficient Funds');
            }, 2000);
        } catch (err) {
            console.error('[Billing] Cheque Return failed:', err);
            alert('Failed to record cheque return. Please try again.');
        } finally {
            setCrProcessing(false);
        }
    };

    const handleAddNewDealer = () => {
        if (!newDealer.businessName || !newDealer.phone) {
            alert('Please fill in business name and phone number');
            return;
        }

        addDealer({
            ...newDealer,
            balance: 0
        });

        // Select the newly added dealer
        const addedDealer = dealers.find(d => d.phone === newDealer.phone);
        if (addedDealer) {
            setSelectedDealer(addedDealer);
        }

        setShowAddDealerModal(false);
        setNewDealer({
            businessName: '',
            contactPerson: '',
            phone: '',
            district: '',
            city: '',
            pinCode: '',
            address: '',
            gstNumber: ''
        });
    };

    const resetForm = () => {
        setSelectedDealer(null);
        setInvoiceItems([]);
        setShowSuccess(false);
        setGeneratedRef('');
        setVehicleName('');
        setVehicleNumber('');
        setDestination('');
        setTransportCharges('0');
        setPaymentTerms('Immediate');
        setGlobalDiscount('0');
        setGlobalCGST('0');
        setGlobalSGST('0');
        setGlobalIGST('0');
        setRoundOff('0');
        setBuyerOrderNo('');
        setBuyerOrderDate('');
        setDispatchDocNo('');
        setDispatchDate('');
        setDeliveryNote('');
        setSupplierRef('');
        setOtherRef('');
        setTermsOfDelivery('');
        setCreditDays('30');
        setDealerSearch('');
        setDriveUploadStatus('idle');
        setDriveError(null);
    };

    const handleNewInvoice = () => {
        if (invoiceItems.length > 0) {
            if (!confirm('You have unsaved items in the current invoice. Are you sure you want to start a new invoice?')) {
                return;
            }
        }
        resetForm();
        clearDraft();
        // Focus search after reset
        setTimeout(() => dealerSearchInputRef.current?.focus(), 100);
    };

    const handlePrint = async () => {
        if (!companySettings) {
            alert('Company settings are missing. Please check your database settings.');
            return;
        }
        // Show the invoice in print-ready mode first
        setShowPrintPreview(true);
        // Open the Select Printer dialog
        setPrintError(null);
        setPrintingStatus('loading');
        setShowPrinterDialog(true);

        // Load printers from Electron
        try {
            if (window.electron?.printer?.getPrinters) {
                const list = await window.electron.printer.getPrinters();
                setPrinters(list);
                // Pre-select the default printer
                const def = list.find((p: any) => p.isDefault);
                setSelectedPrinter(def ? def.name : (list[0]?.name || ''));
            } else {
                setPrinters([]);
            }
        } catch (err) {
            setPrinters([]);
        }
        setPrintingStatus('idle');
    };

    // Success Screen with Green Tick Animation

    return (
        <div className="h-full">
            {/* Input Form - Hidden on Success or Print */}
            <div className={`p-6 h-full overflow-y-auto ${showSuccess ? 'hidden' : 'block'} print:hidden`}>
                <div className="flex justify-between items-end mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">{editInvoiceId ? 'Edit Invoice' : 'New Invoice'}</h1>
                        {/* Input Form Header Continued... */}
                        <p className="text-sm text-slate-500">
                            {editInvoiceId ? 'Modify existing bill details' : 'Create bill with tax details and transport information'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Cheque Return Button */}
                        <button
                            onClick={() => setShowChequeReturnModal(true)}
                            className="bg-red-600 text-white px-5 py-2.5 rounded-xl hover:bg-red-700 transition-all flex items-center gap-2 font-bold shadow-lg shadow-red-100 h-fit"
                        >
                            <CreditCard size={18} />
                            Cheque Return
                        </button>
                        <button
                            onClick={() => handleNewInvoice()}
                            className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 font-bold shadow-lg shadow-emerald-100 h-fit"
                        >
                            <Plus size={20} />
                            New Invoice
                        </button>
                        <div className="text-right bg-white px-4 py-2 rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-500">Bill Date (IST)</p>
                            <p className="font-bold text-slate-800">
                                {new Date().toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    timeZone: 'Asia/Kolkata'
                                })}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Left Column: Dealer & Product Selection */}
                    <div className="xl:col-span-2 space-y-6">

                        {/* Dealer Selection Card */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                                    <Users size={18} />
                                    Dealer Details
                                </h3>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1 bg-slate-100 rounded px-2 border border-slate-200">
                                        <span className="text-sm font-bold text-slate-500">INV</span>
                                        <input
                                            ref={invoiceNoRef}
                                            id="invoice-no-field"
                                            type="text"
                                            value={manualInvoiceNo}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setManualInvoiceNo(val);
                                                checkInvoiceNumberExists(val);
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    invoiceDateRef.current?.focus();
                                                }
                                            }}
                                            placeholder="Auto"
                                            className={`w-24 p-1 bg-transparent font-bold outline-none ${invoiceNoExists ? 'text-red-500' : 'text-slate-800'}`}
                                        />
                                        {invoiceNoExists && (
                                            <span className="absolute -bottom-4 left-0 text-[10px] text-red-500 font-medium whitespace-nowrap">Number already exists!</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-slate-500">Date:</label>
                                        <input
                                            ref={invoiceDateRef}
                                            type="date"
                                            value={invoiceDate}
                                            onChange={(e) => setInvoiceDate(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    dealerSearchInputRef.current?.focus();
                                                }
                                            }}
                                            className="p-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {!selectedDealer ? (
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <SearchableSelect
                                            options={dealers.map(d => ({
                                                ...d,
                                                name: d.businessName,
                                                description: `${d.contactPerson} • ${d.phone} • ${d.city && `${d.city}, `}${d.district}`
                                            }))}
                                            value={''}
                                            onChange={(val: string) => {
                                                const dealer = dealers.find(d => d.id === val);
                                                if (dealer) {
                                                    setSelectedDealer(dealer);
                                                    setTimeout(() => productSelectRef.current?.focus(), 100);
                                                }
                                            }}
                                            placeholder="Search and Select Dealer..."
                                            className="w-full"
                                            ref={dealerSearchInputRef as any}
                                        />
                                    </div>
                                    <button
                                        onClick={() => setShowAddDealerModal(true)}
                                        className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 font-medium shrink-0 h-11"
                                    >
                                        <Users size={18} />
                                        Add New Dealer
                                    </button>
                                </div>
                            ) : (
                                <div className="flex justify-between items-start bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <div>
                                        <h4 className="font-bold text-lg text-slate-800">{selectedDealer.businessName}</h4>
                                        <p className="text-sm text-slate-500">{selectedDealer.contactPerson} | {selectedDealer.phone}</p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            {selectedDealer.city && `${selectedDealer.city}, `}{selectedDealer.district}
                                            {selectedDealer.pinCode && ` - ${selectedDealer.pinCode}`}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-500">Current Balance</p>
                                        <p className={`font-bold text-xl ${selectedDealer.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            ₹{selectedDealer.balance.toLocaleString()}
                                        </p>
                                        <button
                                            onClick={() => setSelectedDealer(null)}
                                            className="text-xs text-blue-600 hover:underline mt-2"
                                        >
                                            Change Dealer
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Product Addition Card */}
                        <div className={`bg-white p-5 rounded-xl shadow-sm border border-slate-200 ${!selectedDealer ? 'opacity-50 pointer-events-none' : ''}`}>
                            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                                <ShoppingCart size={18} />
                                Add Products
                            </h3>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <SearchableSelect
                                        options={products.map(p => {
                                            const available = p.stock - (reservedStock[p.id] || 0);
                                            return {
                                                ...p,
                                                name: `${p.productId} - ${p.name}`,
                                                stock: available,
                                                description: `₹${p.price} per ${p.unit || 'unit'}`
                                            };
                                        })}
                                        value={itemProduct?.id || ''}
                                        onChange={(val: string) => {
                                            const prod = products.find(p => p.id === val);
                                            if (prod) {
                                                setItemProduct(prod);
                                                setTimeout(() => itemQtyRef.current?.focus(), 100);
                                            }
                                        }}
                                        placeholder="Search and Add Product..."
                                        className="w-full"
                                        ref={productSelectRef as any}
                                    />
                                </div>
                                <div className="w-24">
                                    <input
                                        ref={itemQtyRef}
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-center"
                                        placeholder="Qty"
                                        value={itemQty}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9.]/g, '');
                                            if ((val.match(/\./g) || []).length <= 1) {
                                                setItemQty(val);
                                            }
                                            setQtyError(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && itemQty && itemProduct) {
                                                e.preventDefault();
                                                addItemButtonRef.current?.click();
                                            }
                                        }}
                                        onFocus={(e) => e.target.select()}
                                    />
                                    {qtyError && (
                                        <div className="absolute top-full left-0 right-0 text-[10px] text-red-500 font-bold bg-red-50 p-1 rounded border border-red-200 z-10 text-center">
                                            {qtyError}
                                        </div>
                                    )}
                                </div>
                                <button
                                    ref={addItemButtonRef}
                                    onClick={() => handleAddItem()}
                                    disabled={!itemProduct}
                                    className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg hover:bg-emerald-700 disabled:bg-slate-300 transition-colors"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Line Items Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                                        <tr>
                                            <th className="p-3">Product</th>
                                            <th className="p-3 text-center w-20">HSN</th>
                                            <th className="p-3 text-center w-16">Unit</th>
                                            <th className="p-3 text-center w-20">Qty</th>
                                            <th className="p-3 text-right">Price</th>
                                            <th className="p-3 text-center w-16">Disc%</th>
                                            <th className="p-3 text-right">Total</th>
                                            <th className="p-3 text-center w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {invoiceItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="p-8 text-center text-slate-400 italic">No items added yet</td>
                                            </tr>
                                        ) : (
                                            invoiceItems.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50">
                                                    <td className="p-3 font-medium text-slate-700">
                                                        {item.productName}
                                                        <div className="text-xs text-slate-400">{item.productId}</div>
                                                    </td>
                                                    <td className="p-3 text-center text-xs text-slate-500">{item.hsnCode || '-'}</td>
                                                    <td className="p-3 text-center text-xs uppercase text-slate-500">{item.unit || 'nos'}</td>
                                                    <td className="p-3">
                                                        <input
                                                            type="number"
                                                            step="0.001"
                                                            className="w-16 p-1 border rounded text-right focus:ring-1 focus:ring-emerald-500 outline-none font-medium"
                                                            value={item.quantity === 0 ? '' : item.quantity}
                                                            onChange={(e) => handleUpdateItemQty(idx, e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-3 text-right">₹{item.unitPrice}</td>
                                                    <td className="p-3">
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            className="w-14 p-1.5 border border-slate-200 rounded text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                                                            value={item.discount}
                                                            onChange={(e) => handleUpdateItemTax(idx, 'discount', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-3 text-right font-semibold">₹{item.total.toFixed(2)}</td>
                                                    <td className="p-3 text-center">
                                                        <button onClick={() => handleRemoveItem(idx)} className="text-red-400 hover:text-red-600">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Taxable GST Summary Table */}
                        {invoiceItems.length > 0 && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                                    <h3 className="font-semibold text-slate-700 text-sm">Taxable Summary</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-100 text-slate-600 font-medium border-b border-slate-200">
                                            <tr>
                                                <th className="p-3 text-center">HSN</th>
                                                <th className="p-3 text-right">Taxable Value</th>
                                                <th className="p-3 text-right">GST</th>
                                                <th className="p-3 text-right">Total Tax</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(() => {
                                                // Group by HSN code
                                                const hsnGroups = invoiceItems.reduce((acc: any, item) => {
                                                    const hsn = item.hsnCode || 'N/A';
                                                    if (!acc[hsn]) {
                                                        acc[hsn] = {
                                                            hsn,
                                                            taxableValue: 0,
                                                            cgstAmount: 0,
                                                            sgstAmount: 0,
                                                            igstAmount: 0,
                                                        };
                                                    }
                                                    const taxableValue = item.unitPrice * item.quantity;
                                                    acc[hsn].taxableValue += taxableValue;
                                                    acc[hsn].cgstAmount += item.cgstAmount;
                                                    acc[hsn].sgstAmount += item.sgstAmount;
                                                    acc[hsn].igstAmount += item.igstAmount;
                                                    return acc;
                                                }, {});

                                                return Object.values(hsnGroups).map((group: any, idx) => {
                                                    const totalTax = group.cgstAmount + group.sgstAmount + group.igstAmount;
                                                    const gstRate = group.taxableValue > 0 ? (totalTax / group.taxableValue) * 100 : 0;

                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50">
                                                            <td className="p-3 text-center font-medium">{group.hsn}</td>
                                                            <td className="p-3 text-right">₹{group.taxableValue.toFixed(2)}</td>
                                                            <td className="p-3 text-right text-xs">
                                                                {gstRate.toFixed(2)}%
                                                                <div className="text-slate-500">(₹{totalTax.toFixed(2)})</div>
                                                            </td>
                                                            <td className="p-3 text-right font-medium">₹{totalTax.toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                            {/* Summary Row */}
                                            <tr className="bg-slate-50 font-bold">
                                                <td className="p-3 text-right">Total:</td>
                                                <td className="p-3 text-right">₹{invoiceItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0).toFixed(2)}</td>
                                                <td className="p-3 text-right">₹{totalTax.toFixed(2)}</td>
                                                <td className="p-3 text-right">₹{totalTax.toFixed(2)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Transport & Additional Details */}
                        <div className={`bg-white p-5 rounded-xl shadow-sm border border-slate-200 ${invoiceItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                                <Truck size={18} />
                                Transport & Invoice Details
                            </h3>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Vehicle Name / Dispatch Through</label>
                                    <input
                                        ref={vehicleNameRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g. SV Transport"
                                        value={vehicleName}
                                        onChange={(e) => setVehicleName(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 0)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Vehicle Number</label>
                                    <input
                                        ref={vehicleNumberRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g. TN-01-AB-1234"
                                        value={vehicleNumber}
                                        onChange={(e) => setVehicleNumber(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 1)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Destination</label>
                                    <input
                                        ref={destinationRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g. Chennai"
                                        value={destination}
                                        onChange={(e) => setDestination(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 2)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Transport Charges (₹)</label>
                                    <input
                                        ref={transportChargesRef}
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={transportCharges}
                                        onChange={(e) => setTransportCharges(e.target.value.replace(/[^0-9.]/g, ''))}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 3)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Mode/Terms of Payment</label>
                                    <input
                                        ref={paymentTermsRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={paymentTerms}
                                        onChange={(e) => setPaymentTerms(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 4)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Credit Days</label>
                                    <input
                                        ref={creditDaysRef}
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={creditDays}
                                        onChange={(e) => setCreditDays(e.target.value.replace(/[^0-9]/g, ''))}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 5)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Global Discount (%)</label>
                                    <input
                                        ref={globalDiscountRef}
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={globalDiscount}
                                        onChange={(e) => setGlobalDiscount(e.target.value.replace(/[^0-9.]/g, ''))}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 6)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Global CGST (%)</label>
                                    <input
                                        ref={globalCGSTRef}
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={globalCGST}
                                        onChange={(e) => setGlobalCGST(e.target.value.replace(/[^0-9.]/g, ''))}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 7)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Global SGST (%)</label>
                                    <input
                                        ref={globalSGSTRef}
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={globalSGST}
                                        onChange={(e) => setGlobalSGST(e.target.value.replace(/[^0-9.]/g, ''))}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 8)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Global IGST (%)</label>
                                    <input
                                        ref={globalIGSTRef}
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={globalIGST}
                                        onChange={(e) => setGlobalIGST(e.target.value.replace(/[^0-9.]/g, ''))}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 9)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Round Off (₹)</label>
                                    <input
                                        ref={roundOffRef}
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={roundOff}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) setRoundOff(val);
                                        }}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 10)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Buyer's Order No.</label>
                                    <input
                                        ref={buyerOrderNoRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={buyerOrderNo}
                                        onChange={(e) => setBuyerOrderNo(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 11)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Buyer's Order Date</label>
                                    <input
                                        ref={buyerOrderDateRef}
                                        type="date"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={buyerOrderDate}
                                        onChange={(e) => setBuyerOrderDate(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 12)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Dispatch Doc No.</label>
                                    <input
                                        ref={dispatchDocNoRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={dispatchDocNo}
                                        onChange={(e) => setDispatchDocNo(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 13)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Dispatch Date</label>
                                    <input
                                        ref={dispatchDateRef}
                                        type="date"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={dispatchDate}
                                        onChange={(e) => setDispatchDate(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 14)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Delivery Note</label>
                                    <input
                                        ref={deliveryNoteRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={deliveryNote}
                                        onChange={(e) => setDeliveryNote(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 15)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Supplier's Ref</label>
                                    <input
                                        ref={supplierRefRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={supplierRef}
                                        onChange={(e) => setSupplierRef(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 16)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Other Reference(s)</label>
                                    <input
                                        ref={otherRefRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={otherRef}
                                        onChange={(e) => setOtherRef(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 17)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Terms of Delivery</label>
                                    <input
                                        ref={termsOfDeliveryRef}
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={termsOfDelivery}
                                        onChange={(e) => setTermsOfDelivery(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 18)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Calculations & Actions */}
                    <div className="xl:col-span-1">
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 sticky top-6">
                            <h3 className="font-bold text-slate-800 text-lg mb-6 border-b border-slate-100 pb-2 flex items-center gap-2">
                                <CreditCard size={18} />
                                Bill Summary
                            </h3>

                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between text-slate-600">
                                    <span>Subtotal</span>
                                    <span>₹{subTotal.toFixed(2)}</span>
                                </div>
                                {globalCGSTAmount > 0 && (
                                    <div className="flex justify-between text-slate-600 text-sm">
                                        <span className="pl-2">+ CGST ({globalCGST}%)</span>
                                        <span>₹{globalCGSTAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                {globalSGSTAmount > 0 && (
                                    <div className="flex justify-between text-slate-600 text-sm">
                                        <span className="pl-2">+ SGST ({globalSGST}%)</span>
                                        <span>₹{globalSGSTAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                {globalIGSTAmount > 0 && (
                                    <div className="flex justify-between text-slate-600 text-sm">
                                        <span className="pl-2">+ IGST ({globalIGST}%)</span>
                                        <span>₹{globalIGSTAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                {totalDiscount > 0 && (
                                    <div className="flex justify-between text-green-600 text-sm">
                                        <span className="pl-2">- Item Discounts</span>
                                        <span>₹{totalDiscount.toFixed(2)}</span>
                                    </div>
                                )}
                                {parseFloat(globalDiscount) > 0 && (
                                    <div className="flex justify-between text-green-600 text-sm">
                                        <span className="pl-2">- Global Discount ({globalDiscount}%)</span>
                                        <span>₹{globalDiscountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                {parseFloat(transportCharges) > 0 && (
                                    <div className="flex justify-between text-slate-600">
                                        <span>+ Transport</span>
                                        <span>₹{parseFloat(transportCharges).toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-slate-800 pt-2 border-t border-slate-100">
                                    <span>Current Bill</span>
                                    <span>₹{invoiceTotal.toFixed(2)}</span>
                                </div>

                                <div className="flex justify-between text-red-500 pt-2">
                                    <span className="text-sm">Old Balance (+)</span>
                                    <span>₹{previousBalance.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 mb-6">
                                <div className="flex justify-between items-end">
                                    <span className="text-emerald-800 font-medium">Net Payable</span>
                                    <span className="text-2xl font-bold text-emerald-900">₹{grandTotal.toFixed(2)}</span>
                                </div>
                            </div>

                            <button
                                id="create-bill-btn"
                                onClick={() => {
                                    if (!selectedDealer || invoiceItems.length === 0) return;
                                    setShowInvoicePreview(true);
                                }}
                                disabled={!selectedDealer || invoiceItems.length === 0 || isSubmitting}
                                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${!selectedDealer || invoiceItems.length === 0
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                                    }`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <FileText size={20} />
                                        {editInvoiceId ? 'Preview & Update' : 'Preview & Generate Bill'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Add New Dealer Modal */}
                {showAddDealerModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowAddDealerModal(false)}>
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h2 className="text-xl font-bold text-slate-800">Add New Dealer</h2>
                                <button
                                    onClick={() => setShowAddDealerModal(false)}
                                    className="text-slate-400 hover:text-slate-600"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Business Name *</label>
                                    <input
                                        ref={dealerBusinessNameRef}
                                        type="text"
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newDealer.businessName}
                                        onChange={e => setNewDealer({ ...newDealer, businessName: e.target.value })}
                                        onKeyDown={(e) => handleDealerKeyDown(e, 0)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                                        <input
                                            ref={dealerContactPersonRef}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.contactPerson}
                                            onChange={e => setNewDealer({ ...newDealer, contactPerson: e.target.value })}
                                            onKeyDown={(e) => handleDealerKeyDown(e, 1)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Phone *</label>
                                        <input
                                            ref={dealerPhoneRef}
                                            type="tel"
                                            required
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.phone}
                                            onChange={e => setNewDealer({ ...newDealer, phone: e.target.value })}
                                            onKeyDown={(e) => handleDealerKeyDown(e, 2)}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                        <input
                                            ref={dealerCityRef}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            placeholder="e.g., Chennai"
                                            value={newDealer.city}
                                            onChange={e => setNewDealer({ ...newDealer, city: e.target.value })}
                                            onKeyDown={(e) => handleDealerKeyDown(e, 3)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                                        <input
                                            ref={dealerDistrictRef}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.district}
                                            onChange={e => setNewDealer({ ...newDealer, district: e.target.value })}
                                            onKeyDown={(e) => handleDealerKeyDown(e, 4)}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Pin Code</label>
                                        <input
                                            ref={dealerPinCodeRef}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            placeholder="e.g., 600001"
                                            value={newDealer.pinCode}
                                            onChange={e => setNewDealer({ ...newDealer, pinCode: e.target.value.replace(/[^0-9]/g, '') })}
                                            maxLength={6}
                                            onKeyDown={(e) => handleDealerKeyDown(e, 5)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
                                        <input
                                            ref={dealerGstRef}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.gstNumber}
                                            onChange={e => setNewDealer({ ...newDealer, gstNumber: e.target.value.toUpperCase() })}
                                            onKeyDown={(e) => handleDealerKeyDown(e, 6)}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                    <textarea
                                        ref={dealerAddressRef}
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                                        rows={2}
                                        value={newDealer.address}
                                        onChange={e => setNewDealer({ ...newDealer, address: e.target.value })}
                                        onKeyDown={(e) => handleDealerKeyDown(e, 7)}
                                    />
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddDealerModal(false)}
                                        className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleAddNewDealer()}
                                        className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                                    >
                                        Add Dealer
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Printable Invoice - Only visible when printing */}
            {
                showPrintPreview && selectedDealer && companySettings && (
                    <div className="hidden print:block">
                        <PrintableInvoice
                            invoice={{
                                id: editInvoiceId || '',
                                customerId: selectedDealer.id,
                                type: TransactionType.INVOICE,
                                amount: invoiceTotal,
                                date: new Date(invoiceDate),
                                referenceId: generatedRef || `INV${manualInvoiceNo}`,
                                items: invoiceItems,
                                vehicleName,
                                vehicleNumber,
                                destination,
                                transportCharges: parseFloat(transportCharges) || 0,
                                paymentTerms,
                                discountPercent: parseFloat(globalDiscount) || 0,
                                creditDays: parseInt(creditDays) || 30,
                                notes: JSON.stringify({
                                    buyerOrderNo,
                                    buyerOrderDate,
                                    dispatchDocNo,
                                    dispatchDate,
                                    deliveryNote,
                                    supplierRef,
                                    otherRef,
                                    termsOfDelivery,
                                    manualInvoiceNo,
                                    roundOff,
                                    globalCGST,
                                    globalSGST,
                                    globalIGST
                                })
                            }}
                            dealer={selectedDealer}
                            items={invoiceItems}
                            company={companySettings}
                        />
                    </div>
                )
            }

            {/* Success Screen - Show after bill is generated */}
            {
                showSuccess && selectedDealer && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-300 print:hidden">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
                            <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-8 text-center">
                                <div className="w-20 h-20 bg-white rounded-full mx-auto flex items-center justify-center mb-4 animate-in zoom-in duration-500">
                                    <CheckCircle className="text-emerald-600" size={48} />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">Invoice Generated!</h2>
                                <p className="text-emerald-50">Invoice {generatedRef} created successfully</p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="bg-slate-50 p-4 rounded-lg">
                                    <p className="text-sm text-slate-500 mb-1">Dealer</p>
                                    <p className="font-bold text-slate-800">{selectedDealer.businessName}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 p-4 rounded-lg">
                                        <p className="text-sm text-slate-500 mb-1">Amount</p>
                                        <p className="font-bold text-slate-800">₹{invoiceTotal.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-lg">
                                        <p className="text-sm text-slate-500 mb-1">Items</p>
                                        <p className="font-bold text-slate-800">{invoiceItems.length}</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 pt-4">
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => {
                                                if (invoiceTotal <= 0.01) {
                                                    alert("Cannot print invoice with 0 amount.");
                                                    return;
                                                }
                                                handlePrint();
                                            }}
                                            className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Printer size={20} />
                                            Print Invoice
                                        </button>
                                        <button
                                            onClick={() => {
                                                resetForm();
                                                router.push('/billing');
                                            }}
                                            className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Plus size={20} />
                                            New Invoice
                                        </button>
                                        <button
                                            onClick={() => {
                                                const idToEdit = createdInvoiceId || editInvoiceId;
                                                if (idToEdit) {
                                                    // Set URL param to allow refresh persistence
                                                    router.push(`/billing?edit=${idToEdit}`);
                                                }
                                                // If just closing modal, ensure we have the ID set in state
                                                // But usually handling URL param change in useEffect is better. 
                                                // Since we are already on the page with data, just hiding success might be checking url?
                                                // Actually, editInvoiceId comes from searchParams. 
                                                // So pushing router is the correct way to trigger 'edit mode'.
                                                setShowSuccess(false);
                                            }}
                                            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Edit size={20} />
                                            Edit
                                        </button>
                                    </div>

                                    {/* WhatsApp Action - Trigger Preview */}
                                    <button
                                        onClick={() => {
                                            if (invoiceTotal <= 0.01) {
                                                alert("Cannot send invoice with 0 amount.");
                                                return;
                                            }
                                            const invoiceData = {
                                                id: editInvoiceId || '',
                                                customerId: selectedDealer.id,
                                                type: TransactionType.INVOICE,
                                                amount: invoiceTotal,
                                                date: new Date(invoiceDate),
                                                referenceId: generatedRef,
                                                items: invoiceItems,
                                                vehicleName,
                                                vehicleNumber,
                                                destination,
                                                transportCharges: parseFloat(transportCharges) || 0,
                                                paymentTerms,
                                                discountPercent: parseFloat(globalDiscount) || 0,
                                                creditDays: parseInt(creditDays) || 30,
                                                notes: JSON.stringify({
                                                    buyerOrderNo,
                                                    buyerOrderDate,
                                                    dispatchDocNo,
                                                    dispatchDate,
                                                    deliveryNote,
                                                    supplierRef,
                                                    otherRef,
                                                    termsOfDelivery,
                                                    manualInvoiceNo,
                                                    roundOff,
                                                    globalCGST,
                                                    globalSGST,
                                                    globalIGST
                                                })
                                            };
                                            setPreviewData({ dealer: selectedDealer, invoiceData });
                                            setShowWhatsAppPreview(true);
                                        }}
                                        disabled={whatsappSending === 'sending'}
                                        className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all border-2 ${whatsappSending === 'success'
                                            ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                                            : whatsappSending === 'error'
                                                ? 'bg-red-50 border-red-500 text-red-600'
                                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                            }`}
                                    >
                                        {whatsappSending === 'sending' ? (
                                            <Loader2 size={20} className="animate-spin" />
                                        ) : whatsappSending === 'success' ? (
                                            <Check size={20} />
                                        ) : (
                                            <MessageSquare size={20} className="text-emerald-500" />
                                        )}
                                        {whatsappSending === 'sending' ? 'Sending WhatsApp...' :
                                            whatsappSending === 'success' ? 'Sent to WhatsApp!' :
                                                whatsappSending === 'error' ? 'Retry WhatsApp Send' : 'Send via WhatsApp'}
                                    </button>
                                    {whatsappError && (
                                        <p className="text-[10px] text-red-500 text-center">{whatsappError}</p>
                                    )}
                                    {/* Google Drive Upload Status */}
                                    {driveUploadStatus !== 'idle' && (
                                        <div className={`mt-2 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 ${driveUploadStatus === 'uploading' ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                                            driveUploadStatus === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                                                'bg-red-50 text-red-600 border border-red-200'
                                            }`}>
                                            {driveUploadStatus === 'uploading' && <Loader2 size={14} className="animate-spin" />}
                                            {driveUploadStatus === 'success' && <Check size={14} />}
                                            {driveUploadStatus === 'uploading' ? 'Saving to Google Drive...' :
                                                driveUploadStatus === 'success' ? '✓ Invoice saved to Google Drive' :
                                                    `Drive upload failed: ${driveError}`}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Invoice Preview Modal (Before Generation) */}
            {showInvoicePreview && selectedDealer && companySettings && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300 print:hidden">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-300">
                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Invoice Preview</h2>
                                <p className="text-sm text-slate-500">Review carefully before generating the final bill</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowInvoicePreview(false)}
                                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors border border-slate-300 bg-white shadow-sm"
                                >
                                    Back to Form
                                </button>
                                <button
                                    onClick={() => {
                                        setShowInvoicePreview(false);
                                        handleCreateBill();
                                    }}
                                    className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                                >
                                    Confirm & Generate Bill
                                </button>
                                <button
                                    onClick={() => setShowInvoicePreview(false)}
                                    className="p-2 hover:bg-slate-200 rounded-full transition-colors ml-2"
                                >
                                    <X size={24} className="text-slate-500" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body - Scrollable Preview */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-100">
                            <div className="bg-white shadow-xl mx-auto max-w-[21cm] p-8 min-h-[29.7cm]">
                                <PrintableInvoice
                                    invoice={{
                                        id: editInvoiceId || '',
                                        customerId: selectedDealer.id,
                                        type: TransactionType.INVOICE,
                                        amount: invoiceTotal,
                                        date: new Date(invoiceDate),
                                        referenceId: generatedRef || `INV${manualInvoiceNo}`,
                                        items: invoiceItems,
                                        vehicleName,
                                        vehicleNumber,
                                        destination,
                                        transportCharges: parseFloat(transportCharges) || 0,
                                        paymentTerms,
                                        discountPercent: parseFloat(globalDiscount) || 0,
                                        creditDays: parseInt(creditDays) || 30,
                                        notes: JSON.stringify({
                                            buyerOrderNo,
                                            buyerOrderDate,
                                            dispatchDocNo,
                                            dispatchDate,
                                            deliveryNote,
                                            supplierRef,
                                            otherRef,
                                            termsOfDelivery,
                                            manualInvoiceNo,
                                            roundOff,
                                            globalCGST,
                                            globalSGST,
                                            globalIGST
                                        })
                                    }}
                                    dealer={selectedDealer}
                                    items={invoiceItems}
                                    company={companySettings}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* WhatsApp Preview Modal */}
            {showWhatsAppPreview && previewData && companySettings && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300 print:hidden">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-300">
                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">WhatsApp Invoice Preview</h2>
                                <p className="text-sm text-slate-500">Review the invoice before sending it to {previewData.dealer.businessName}</p>
                            </div>
                            <button
                                onClick={() => setShowWhatsAppPreview(false)}
                                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                            >
                                <X size={24} className="text-slate-500" />
                            </button>
                        </div>

                        {/* Modal Body - Scrollable Preview */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-100">
                            <div className="max-w-[210mm] mx-auto shadow-xl">
                                <PrintableInvoice
                                    invoice={previewData.invoiceData}
                                    dealer={previewData.dealer}
                                    items={previewData.invoiceData.items}
                                    company={companySettings}
                                />
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
                            <button
                                onClick={() => setShowWhatsAppPreview(false)}
                                className="px-6 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    setShowWhatsAppPreview(false);
                                    await handleSendWhatsApp(previewData.dealer, previewData.invoiceData);
                                }}
                                className="px-8 py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-200"
                            >
                                <MessageSquare size={20} />
                                {whatsappSending === 'sending' ? 'Sending...' : 'Confirm & Send WhatsApp'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* End of Print Preview */}

            {/* ─── Select Printer Modal ─── */}
            {showPrinterDialog && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm print:hidden"
                    onClick={() => { setShowPrinterDialog(false); setShowPrintPreview(false); }}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                                    <Printer size={18} className="text-slate-700" />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-800 text-base">Select Printer</p>
                                    <p className="text-xs text-slate-400">Choose printer for invoice</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setShowPrinterDialog(false); setShowPrintPreview(false); }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Printer List */}
                        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                            {printingStatus === 'loading' ? (
                                <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                                    <Loader2 size={18} className="animate-spin" />
                                    <span className="text-sm">Loading printers...</span>
                                </div>
                            ) : printers.length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-4">No printers found</p>
                            ) : (
                                printers.map((printer) => {
                                    const isSelected = selectedPrinter === printer.name;
                                    return (
                                        <button
                                            key={printer.name}
                                            onClick={() => setSelectedPrinter(printer.name)}
                                            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${isSelected
                                                ? 'border-emerald-500 bg-emerald-50'
                                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                }`}
                                        >
                                            <p className={`font-semibold text-sm ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
                                                {printer.displayName || printer.name}
                                            </p>
                                            <p className={`text-xs mt-0.5 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {printer.isDefault ? '✓ Default' : 'Ready'}
                                                {printer.description ? ` · ${printer.description}` : ''}
                                            </p>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {/* Error */}
                        {printError && (
                            <p className="px-5 text-xs text-red-500 pb-2">{printError}</p>
                        )}

                        {/* Actions */}
                        <div className="px-4 pb-4 space-y-2">
                            {/* Print Now — native silent print */}
                            <button
                                disabled={printingStatus === 'printing' || !selectedPrinter}
                                onClick={async () => {
                                    if (!window.electron?.printer?.print) {
                                        // Fallback: use system dialog
                                        window.print();
                                        setShowPrinterDialog(false);
                                        return;
                                    }
                                    setPrintingStatus('printing');
                                    setPrintError(null);
                                    try {
                                        await window.electron.printer.print(selectedPrinter);
                                        setPrintingStatus('done');
                                        setTimeout(() => {
                                            setShowPrinterDialog(false);
                                            setShowPrintPreview(false);
                                            setPrintingStatus('idle');
                                        }, 800);
                                    } catch (err: any) {
                                        setPrintingStatus('error');
                                        setPrintError(err.message || 'Printing failed. Try the fallback below.');
                                    }
                                }}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${printingStatus === 'done'
                                    ? 'bg-emerald-600 text-white'
                                    : printingStatus === 'printing'
                                        ? 'bg-slate-700 text-white cursor-wait'
                                        : 'bg-slate-800 text-white hover:bg-slate-900'
                                    }`}
                            >
                                {printingStatus === 'printing' && <Loader2 size={18} className="animate-spin" />}
                                {printingStatus === 'done' && <Check size={18} />}
                                {printingStatus !== 'printing' && printingStatus !== 'done' && <Printer size={18} />}
                                {printingStatus === 'printing' ? 'Printing...' : printingStatus === 'done' ? 'Sent to Printer!' : 'Print Now'}
                            </button>

                            {/* Fallback: system dialog */}
                            <button
                                onClick={() => {
                                    setShowPrinterDialog(false);
                                    setTimeout(() => window.print(), 200);
                                }}
                                className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                Print with System Dialog (Fallback)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                Cheque Return Modal
            ═══════════════════════════════════════════════════════════ */}
            {showChequeReturnModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-red-100 overflow-hidden">
                        {/* Modal Header */}
                        <div className="bg-red-600 text-white p-5 flex justify-between items-start">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2">
                                    <CreditCard size={20} />
                                    Record Cheque Return
                                </h2>
                                <p className="text-red-200 text-sm mt-1">
                                    Creates an invoice to increase outstanding balance
                                </p>
                            </div>
                            <button
                                onClick={() => setShowChequeReturnModal(false)}
                                className="text-red-200 hover:text-white transition-colors mt-1"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {crSuccess ? (
                            <div className="p-10 text-center">
                                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle size={40} className="text-emerald-600" />
                                </div>
                                <p className="font-bold text-slate-800 text-xl">Cheque Return Recorded!</p>
                                <p className="text-slate-500 text-sm mt-2">
                                    Balance updated &amp; WhatsApp statement sent{crDealer?.phone ? '' : ' (no phone on file)'}.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleChequeReturn} className="p-5 space-y-4">
                                {/* Warning banner */}
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                                    <strong>⚠️</strong> This will <strong>increase</strong> the dealer's outstanding balance and send a WhatsApp statement.
                                </div>

                                {/* Dealer Search */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">
                                        Select Dealer *
                                    </label>
                                    {crDealer ? (
                                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{crDealer.businessName}</p>
                                                <p className="text-xs text-slate-500">{crDealer.phone} &bull; Balance: ₹{crDealer.balance.toLocaleString()}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { setCrDealer(null); setCrDealerSearch(''); }}
                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <SearchableSelect
                                            options={dealers.map(d => ({
                                                ...d,
                                                name: d.businessName,
                                                description: `${d.phone} • ₹${d.balance.toLocaleString()} outstanding`
                                            }))}
                                            value={''}
                                            onChange={(val: string) => {
                                                const dealer = dealers.find(d => d.id === val);
                                                if (dealer) {
                                                    setCrDealer(dealer);
                                                    setTimeout(() => crChequeNoRef.current?.focus(), 100);
                                                }
                                            }}
                                            placeholder="Search and select dealer..."
                                            className="w-full"
                                        />
                                    )}
                                </div>

                                {/* Cheque / Receipt Number */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">
                                        Original Cheque / Receipt No
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg focus:border-red-500 outline-none font-mono"
                                        placeholder="e.g. 123456 or R001"
                                        value={crChequeNo}
                                        onChange={e => setCrChequeNo(e.target.value)}
                                        ref={crChequeNoRef}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crAmountRef.current?.focus(); } }}
                                    />
                                </div>

                                {/* Bounced Amount */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">
                                        Bounced Amount *
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            className="w-full pl-8 pr-4 py-3 border-2 border-slate-200 rounded-lg focus:border-red-500 outline-none font-bold text-slate-800"
                                            placeholder="Enter bounced amount"
                                            value={crAmount}
                                            onChange={e => setCrAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                                            required
                                            ref={crAmountRef}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crReasonRef.current?.focus(); } }}
                                        />
                                    </div>
                                </div>

                                {/* Reason */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">
                                        Reason for Return
                                    </label>
                                    <select
                                        className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg focus:border-red-500 outline-none bg-white font-medium"
                                        value={crReason}
                                        onChange={e => setCrReason(e.target.value)}
                                        ref={crReasonRef}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crSubmitRef.current?.focus(); } }}
                                    >
                                        <option>Insufficient Funds</option>
                                        <option>Signature Mismatch</option>
                                        <option>Account Closed</option>
                                        <option>Date Mismatch</option>
                                        <option>Payment Stopped by Drawer</option>
                                        <option>Other</option>
                                    </select>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowChequeReturnModal(false)}
                                        className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        ref={crSubmitRef}
                                        type="submit"
                                        disabled={crProcessing || !crDealer || !crAmount}
                                        className="flex-[2] bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 disabled:bg-slate-300 flex items-center justify-center gap-2 transition-all"
                                    >
                                        {crProcessing ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                <MessageSquare size={18} />
                                                Record &amp; Send via WhatsApp
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

