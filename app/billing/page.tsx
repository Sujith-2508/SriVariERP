'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useData } from '@/contexts/DataContext';
import { Dealer, InvoiceItem, Product, CompanySettings, TransactionType } from '@/types';
import { Search, Plus, Trash2, FileText, CheckCircle, Users, ShoppingCart, X, Truck, CreditCard, Printer } from 'lucide-react';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';

import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PrintableInvoice from '@/components/PrintableInvoice';
import { DEFAULT_COMPANY_SETTINGS } from '@/constants';

export default function Billing() {
    const { dealers, products, createInvoice, updateInvoice, addDealer, transactions } = useData();
    const router = useRouter();
    const searchParams = useSearchParams();
    const editInvoiceId = searchParams.get('edit');

    const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [generatedRef, setGeneratedRef] = useState<string>('');
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);

    // Dealer Search
    const [dealerSearch, setDealerSearch] = useState('');
    const [showDealerDropdown, setShowDealerDropdown] = useState(false);
    const [showAddDealerModal, setShowAddDealerModal] = useState(false);
    const dealerSearchRef = useRef<HTMLDivElement>(null);

    // New Dealer Form with City and PinCode
    const [newDealer, setNewDealer] = useState({
        businessName: '',
        contactPerson: '',
        phone: '',
        district: '',
        city: '',
        pinCode: '',
        address: '',
        gstNumber: ''
    });

    // Refs for Enter key navigation in Add Dealer modal
    const dealerBusinessNameRef = useRef<HTMLInputElement>(null);
    const dealerPhoneRef = useRef<HTMLInputElement>(null);
    const dealerFieldRefs = [dealerBusinessNameRef, dealerPhoneRef] as any;
    const { handleKeyDown: handleDealerKeyDown } = useEnterKeyNavigation(dealerFieldRefs);

    // Refs for Enter key navigation in Invoice Form
    const vehicleNameRef = useRef<HTMLInputElement>(null);
    const vehicleNumberRef = useRef<HTMLInputElement>(null);
    const destinationRef = useRef<HTMLInputElement>(null);
    const transportChargesRef = useRef<HTMLInputElement>(null);
    const creditDaysRef = useRef<HTMLInputElement>(null);
    const globalDiscountRef = useRef<HTMLInputElement>(null);
    const buyerOrderNoRef = useRef<HTMLInputElement>(null);
    const buyerOrderDateRef = useRef<HTMLInputElement>(null);
    const dispatchDocNoRef = useRef<HTMLInputElement>(null);
    const dispatchDateRef = useRef<HTMLInputElement>(null);
    const dispatchThroughRef = useRef<HTMLInputElement>(null);
    const termsOfDeliveryRef = useRef<HTMLInputElement>(null);

    const invoiceFieldRefs = [
        vehicleNameRef,
        vehicleNumberRef,
        destinationRef,
        transportChargesRef,
        creditDaysRef,
        globalDiscountRef,
        buyerOrderNoRef,
        buyerOrderDateRef,
        dispatchDocNoRef,
        dispatchDateRef,
        dispatchThroughRef,
        termsOfDeliveryRef
    ] as any;
    const { handleKeyDown: handleInvoiceKeyDown } = useEnterKeyNavigation(invoiceFieldRefs);

    // Product Selection State
    const [itemProduct, setItemProduct] = useState<Product | null>(null);
    const [itemQty, setItemQty] = useState<string>('1');

    // Transport & Invoice Details
    const [vehicleName, setVehicleName] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [destination, setDestination] = useState('');
    const [transportCharges, setTransportCharges] = useState<string>('0');
    const [paymentTerms, setPaymentTerms] = useState('Immediate'); // Cash, Cheque, Credit
    const [globalDiscount, setGlobalDiscount] = useState<string>('0');
    const [creditDays, setCreditDays] = useState<string>('30');

    // New Fields for Invoice
    const [buyerOrderNo, setBuyerOrderNo] = useState('');
    const [buyerOrderDate, setBuyerOrderDate] = useState('');
    const [dispatchDocNo, setDispatchDocNo] = useState('');
    const [dispatchDate, setDispatchDate] = useState('');
    const [dispatchThrough, setDispatchThrough] = useState('');
    const [termsOfDelivery, setTermsOfDelivery] = useState('');

    // Invoice Number Manual Entry
    const [manualInvoiceNo, setManualInvoiceNo] = useState('');

    // Invoice Date
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);

    // Initialize Manual Invoice Number
    useEffect(() => {
        if (!editInvoiceId && !manualInvoiceNo) {
            setManualInvoiceNo(String(transactions.filter(t => t.type === 'INVOICE').length + 1).padStart(3, '0'));
        }
    }, [transactions, editInvoiceId, manualInvoiceNo]);

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

            // Fetch Items
            const { data: items, error } = await supabase
                .from('invoice_items')
                .select('*')
                .eq('transaction_id', editInvoiceId);

            if (!error && items) {
                const loadedItems: InvoiceItem[] = items.map(item => ({
                    productId: item.product_id,
                    productName: item.product_name,
                    quantity: item.quantity,
                    unitPrice: item.unit_price,
                    cgst: item.cgst,
                    sgst: item.sgst,
                    igst: item.igst,
                    cgstAmount: item.cgst_amount,
                    sgstAmount: item.sgst_amount,
                    igstAmount: item.igst_amount,
                    discount: item.discount,
                    discountAmount: item.discount_amount,
                    total: item.total,
                    gstAmount: item.gst_amount
                }));
                setInvoiceItems(loadedItems);
            }
        };

        if (dealers.length > 0 && transactions.length > 0) {
            loadInvoice();
        }
    }, [editInvoiceId, dealers, transactions]);

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

    // Calculations
    const subTotal = invoiceItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
    const totalTax = invoiceItems.reduce((acc, item) => acc + item.cgstAmount + item.sgstAmount + item.igstAmount, 0);
    const totalDiscount = invoiceItems.reduce((acc, item) => acc + item.discountAmount, 0);
    const globalDiscountAmount = (subTotal * parseFloat(globalDiscount || '0')) / 100;
    const invoiceTotal = subTotal + totalTax - totalDiscount - globalDiscountAmount + parseFloat(transportCharges || '0');
    const previousBalance = selectedDealer ? selectedDealer.balance : 0;
    const grandTotal = invoiceTotal + previousBalance;

    const handleAddItem = () => {
        if (!itemProduct || !selectedDealer) return;

        const qty = parseInt(itemQty) || 1;

        // Check Stock
        if (qty > itemProduct.stock) {
            alert(`Insufficient stock! Only ${itemProduct.stock} available.`);
            return;
        }

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
        const total = baseAmount + cgstAmount + sgstAmount + igstAmount;

        const newItem: InvoiceItem = {
            productId: itemProduct.id,
            productName: itemProduct.name,
            quantity: qty,
            unitPrice: itemProduct.price,
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
    };


    const handleRemoveItem = (index: number) => {
        const newItems = [...invoiceItems];
        newItems.splice(index, 1);
        setInvoiceItems(newItems);
    };

    const handleUpdateItemTax = (index: number, field: 'cgst' | 'sgst' | 'igst' | 'discount', value: string) => {
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
        item.total = baseAmount + item.cgstAmount + item.sgstAmount + item.igstAmount - item.discountAmount;

        setInvoiceItems(newItems);
    };

    const handleUpdateItemQty = (index: number, value: string) => {
        // Allow empty string for typing
        if (value === '') {
            const newItems = [...invoiceItems];
            newItems[index].quantity = 0;
            setInvoiceItems(newItems);
            return;
        }

        const qty = parseInt(value);
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
        item.total = baseAmount + item.cgstAmount + item.sgstAmount + item.igstAmount - item.discountAmount;

        setInvoiceItems(newItems);
    };

    const handleCreateBill = async () => {
        if (!selectedDealer || invoiceItems.length === 0) return;

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
                creditDays: parseInt(creditDays) || 30
            });
            // For update, we might want to just show success and then redirect back or stay
            // Here reusing generatedRef as the existing ID
            setGeneratedRef(transactions.find(t => t.id === editInvoiceId)?.referenceId || 'UPDATED');
        } else {
            const refId = await createInvoice(selectedDealer.id, invoiceItems, invoiceTotal, {
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
                    dispatchThrough,
                    termsOfDelivery,
                    manualInvoiceNo
                })
            });
            setGeneratedRef((manualInvoiceNo ? `INV${manualInvoiceNo}` : refId));
        }

        setIsSubmitting(false);
        setShowSuccess(true);
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
        setDealerSearch('');
    };

    const handlePrint = () => {
        if (!companySettings) {
            alert('Company settings (Name, Address, GST) are missing or failed to load. Please check your database settings.');
            return;
        }
        setShowPrintPreview(true);
        setTimeout(() => {
            window.print();
        }, 500);
    };

    // Success Screen with Green Tick Animation

    return (
        <div className="h-full">
            {/* Input Form - Hidden on Success or Print */}
            <div className={`p-6 h-full overflow-y-auto ${showSuccess ? 'hidden' : 'block'} print:hidden`}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">{editInvoiceId ? 'Edit Invoice' : 'New Invoice'}</h1>
                        {/* Input Form Header Continued... */}
                        <p className="text-sm text-slate-500">
                            {editInvoiceId ? 'Modify existing bill details' : 'Create bill with tax details and transport information'}
                        </p>
                    </div>
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
                                            type="text"
                                            value={manualInvoiceNo}
                                            onChange={(e) => setManualInvoiceNo(e.target.value)}
                                            placeholder="Auto"
                                            className="w-24 p-1 bg-transparent font-bold text-slate-800 outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-slate-500">Date:</label>
                                        <input
                                            type="date"
                                            value={invoiceDate}
                                            onChange={(e) => setInvoiceDate(e.target.value)}
                                            className="p-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {!selectedDealer ? (
                                <div className="flex gap-3" ref={dealerSearchRef}>
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                                        <input
                                            type="text"
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            placeholder="Search dealer by name, phone, city..."
                                            value={dealerSearch}
                                            onChange={(e) => {
                                                setDealerSearch(e.target.value);
                                                setShowDealerDropdown(true);
                                            }}
                                            onFocus={() => setShowDealerDropdown(true)}
                                        />
                                        {/* Dropdown */}
                                        {showDealerDropdown && dealerSearch && (
                                            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                                {filteredDealers.length === 0 ? (
                                                    <div className="p-4 text-center text-slate-500">
                                                        No dealers found
                                                    </div>
                                                ) : (
                                                    filteredDealers.map(d => (
                                                        <button
                                                            key={d.id}
                                                            className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                                                            onClick={() => {
                                                                setSelectedDealer(d);
                                                                setShowDealerDropdown(false);
                                                                setDealerSearch('');
                                                            }}
                                                        >
                                                            <p className="font-medium text-slate-800">{d.businessName}</p>
                                                            <p className="text-xs text-slate-500">
                                                                {d.contactPerson} • {d.phone} • {d.city && `${d.city}, `}{d.district}
                                                            </p>
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setShowAddDealerModal(true)}
                                        className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 font-medium shrink-0"
                                    >
                                        <Plus size={18} />
                                        Add New
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
                                    <select
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={itemProduct?.id || ''}
                                        onChange={(e) => setItemProduct(products.find(p => p.id === e.target.value) || null)}
                                    >
                                        <option value="" disabled>Select Product...</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                                                {p.productId} - {p.name} (₹{p.price}) {p.stock <= 0 ? '- OUT OF STOCK' : `- Stock: ${p.stock}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-24">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-center"
                                        placeholder="Qty"
                                        value={itemQty}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                            setItemQty(val);
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={handleAddItem}
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
                                            <th className="p-3 text-center w-16">CGST%</th>
                                            <th className="p-3 text-center w-16">SGST%</th>
                                            <th className="p-3 text-center w-16">IGST%</th>
                                            <th className="p-3 text-center w-16">Disc%</th>
                                            <th className="p-3 text-right">Total</th>
                                            <th className="p-3 text-center w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {invoiceItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={11} className="p-8 text-center text-slate-400 italic">No items added yet</td>
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
                                                            type="text"
                                                            inputMode="numeric"
                                                            className="w-16 p-1.5 border border-slate-200 rounded text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                                                            value={item.quantity || ''}
                                                            onChange={(e) => handleUpdateItemQty(idx, e.target.value.replace(/[^0-9]/g, ''))}
                                                        />
                                                    </td>
                                                    <td className="p-3 text-right">₹{item.unitPrice}</td>
                                                    <td className="p-3">
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            className="w-14 p-1.5 border border-slate-200 rounded text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                                                            value={item.cgst}
                                                            onChange={(e) => handleUpdateItemTax(idx, 'cgst', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            className="w-14 p-1.5 border border-slate-200 rounded text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                                                            value={item.sgst}
                                                            onChange={(e) => handleUpdateItemTax(idx, 'sgst', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            className="w-14 p-1.5 border border-slate-200 rounded text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                                                            value={item.igst}
                                                            onChange={(e) => handleUpdateItemTax(idx, 'igst', e.target.value)}
                                                        />
                                                    </td>
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

                        {/* Transport & Additional Details */}
                        <div className={`bg-white p-5 rounded-xl shadow-sm border border-slate-200 ${invoiceItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                                <Truck size={18} />
                                Transport & Payment Details
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Vehicle Name</label>
                                    <input
                                        ref={vehicleNameRef}
                                        type="text"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g., SV Transport"
                                        value={vehicleName}
                                        onChange={(e) => setVehicleName(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 0)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Vehicle Number</label>
                                    <input
                                        ref={vehicleNumberRef}
                                        type="text"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g., TN-01-AB-1234"
                                        value={vehicleNumber}
                                        onChange={(e) => setVehicleNumber(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 1)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Destination</label>
                                    <input
                                        ref={destinationRef}
                                        type="text"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g., Chennai"
                                        value={destination}
                                        onChange={(e) => setDestination(e.target.value)}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 2)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Transport Charges (₹)</label>
                                    <input
                                        ref={transportChargesRef}
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="0"
                                        value={transportCharges}
                                        onChange={(e) => setTransportCharges(e.target.value.replace(/[^0-9.]/g, ''))}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 3)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Credit Days *</label>
                                    <input
                                        ref={creditDaysRef}
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="e.g., 30, 45, 60, 90"
                                        value={creditDays}
                                        onChange={(e) => setCreditDays(e.target.value.replace(/[^0-9]/g, ''))}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 4)}
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Days until payment due</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Global Discount (%)</label>
                                    <input
                                        ref={globalDiscountRef}
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="0"
                                        value={globalDiscount}
                                        onChange={(e) => setGlobalDiscount(e.target.value.replace(/[^0-9.]/g, ''))}
                                        onKeyDown={(e) => handleInvoiceKeyDown(e, 5)}
                                    />
                                </div>

                                {/* New Fields */}
                                <div className="col-span-2 md:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4 mt-2">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Buyer's Order No.</label>
                                        <input
                                            ref={buyerOrderNoRef}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                            value={buyerOrderNo}
                                            onChange={(e) => setBuyerOrderNo(e.target.value)}
                                            onKeyDown={(e) => handleInvoiceKeyDown(e, 6)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Buyer's Order Date</label>
                                        <input
                                            ref={buyerOrderDateRef}
                                            type="date"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                            value={buyerOrderDate}
                                            onChange={(e) => setBuyerOrderDate(e.target.value)}
                                            onKeyDown={(e) => handleInvoiceKeyDown(e, 7)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Dispatch Doc No.</label>
                                        <input
                                            ref={dispatchDocNoRef}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                            value={dispatchDocNo}
                                            onChange={(e) => setDispatchDocNo(e.target.value)}
                                            onKeyDown={(e) => handleInvoiceKeyDown(e, 8)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Dispatch Date</label>
                                        <input
                                            ref={dispatchDateRef}
                                            type="date"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                            value={dispatchDate}
                                            onChange={(e) => setDispatchDate(e.target.value)}
                                            onKeyDown={(e) => handleInvoiceKeyDown(e, 9)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Dispatch Through</label>
                                        <input
                                            ref={dispatchThroughRef}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                            value={dispatchThrough}
                                            onChange={(e) => setDispatchThrough(e.target.value)}
                                            onKeyDown={(e) => handleInvoiceKeyDown(e, 10)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Terms of Delivery</label>
                                        <input
                                            ref={termsOfDeliveryRef}
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                            value={termsOfDelivery}
                                            onChange={(e) => setTermsOfDelivery(e.target.value)}
                                            onKeyDown={(e) => handleInvoiceKeyDown(e, 11)}
                                        />
                                    </div>
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
                                <div className="flex justify-between text-slate-600 text-sm">
                                    <span className="pl-2">+ CGST</span>
                                    <span>₹{invoiceItems.reduce((a, i) => a + i.cgstAmount, 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600 text-sm">
                                    <span className="pl-2">+ SGST</span>
                                    <span>₹{invoiceItems.reduce((a, i) => a + i.sgstAmount, 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600 text-sm">
                                    <span className="pl-2">+ IGST</span>
                                    <span>₹{invoiceItems.reduce((a, i) => a + i.igstAmount, 0).toFixed(2)}</span>
                                </div>
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
                                onClick={handleCreateBill}
                                disabled={invoiceItems.length === 0 || isSubmitting}
                                className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-white transition-all shadow-lg ${isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 hover:shadow-xl'
                                    }`}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Processing...
                                    </span>
                                ) : (
                                    <>
                                        <FileText size={20} />
                                        <FileText size={20} />
                                        {editInvoiceId ? 'Update Bill' : 'Confirm & Generate Bill'}
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
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.contactPerson}
                                            onChange={e => setNewDealer({ ...newDealer, contactPerson: e.target.value })}
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
                                            onKeyDown={(e) => handleDealerKeyDown(e, 1)}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                        <input
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            placeholder="e.g., Chennai"
                                            value={newDealer.city}
                                            onChange={e => setNewDealer({ ...newDealer, city: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">District</label>
                                        <input
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.district}
                                            onChange={e => setNewDealer({ ...newDealer, district: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Pin Code</label>
                                        <input
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            placeholder="e.g., 600001"
                                            value={newDealer.pinCode}
                                            onChange={e => setNewDealer({ ...newDealer, pinCode: e.target.value.replace(/[^0-9]/g, '') })}
                                            maxLength={6}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
                                        <input
                                            type="text"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newDealer.gstNumber}
                                            onChange={e => setNewDealer({ ...newDealer, gstNumber: e.target.value.toUpperCase() })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                    <textarea
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                                        rows={2}
                                        value={newDealer.address}
                                        onChange={e => setNewDealer({ ...newDealer, address: e.target.value })}
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
                                        onClick={handleAddNewDealer}
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
            {showPrintPreview && selectedDealer && companySettings && (
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
                                dispatchThrough,
                                termsOfDelivery,
                                manualInvoiceNo
                            })
                        }}
                        dealer={selectedDealer}
                        items={invoiceItems}
                        company={companySettings}
                    />
                </div>
            )}

            {/* Success Screen - Show after bill is generated */}
            {showSuccess && selectedDealer && (
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

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={handlePrint}
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
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors"
                                >
                                    New Invoice
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* End of Print Preview */}
        </div>
    );
}

