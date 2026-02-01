'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useData } from '@/contexts/DataContext';
import { Dealer, InvoiceItem, Product } from '@/types';
import { Search, Plus, Trash2, FileText, CheckCircle, Users, ShoppingCart, X, Truck, CreditCard } from 'lucide-react';

export default function Billing() {
    const { dealers, products, createInvoice, addDealer } = useData();

    const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [generatedRef, setGeneratedRef] = useState<string>('');

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

    // Product Selection State
    const [itemProduct, setItemProduct] = useState<Product | null>(null);
    const [itemQty, setItemQty] = useState<string>('1');

    // Transport & Invoice Details
    const [vehicleName, setVehicleName] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [destination, setDestination] = useState('');
    const [transportCharges, setTransportCharges] = useState<string>('0');
    const [paymentTerms, setPaymentTerms] = useState('Immediate');
    const [globalDiscount, setGlobalDiscount] = useState<string>('0');
    const [creditDays, setCreditDays] = useState<string>('30');  // Credit Days for due date

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
        if (!itemProduct) return;

        const qty = parseInt(itemQty) || 1;

        // Check Stock
        if (qty > itemProduct.stock) {
            alert(`Insufficient stock! Only ${itemProduct.stock} available.`);
            return;
        }

        // Default tax split: GST Rate / 2 for CGST and SGST
        const defaultRate = itemProduct.gstRate * 100;
        const cgst = defaultRate / 2;
        const sgst = defaultRate / 2;

        const baseAmount = itemProduct.price * qty;
        const cgstAmount = (baseAmount * cgst) / 100;
        const sgstAmount = (baseAmount * sgst) / 100;
        const total = baseAmount + cgstAmount + sgstAmount;

        const newItem: InvoiceItem = {
            productId: itemProduct.id,
            productName: itemProduct.name,
            quantity: qty,
            unitPrice: itemProduct.price,
            cgst: cgst,
            sgst: sgst,
            igst: 0,
            cgstAmount: cgstAmount,
            sgstAmount: sgstAmount,
            igstAmount: 0,
            discount: 0,
            discountAmount: 0,
            total: total
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

        const refId = await createInvoice(selectedDealer.id, invoiceItems, invoiceTotal, {
            vehicleName,
            vehicleNumber,
            destination,
            transportCharges: parseFloat(transportCharges) || 0,
            paymentTerms,
            discountPercent: parseFloat(globalDiscount) || 0,
            creditDays: parseInt(creditDays) || 30  // Pass credit days to invoice
        });
        setGeneratedRef(refId);

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

    // Success Screen with Green Tick Animation
    if (showSuccess) {
        return (
            <div className="flex items-center justify-center h-full p-6 animate-in fade-in zoom-in duration-500">
                <div className="bg-white p-10 rounded-2xl shadow-xl text-center max-w-md w-full border border-emerald-100">
                    {/* Animated Success Icon */}
                    <div className="relative mx-auto w-24 h-24 mb-6">
                        <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-50"></div>
                        <div className="relative w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
                            <CheckCircle className="text-white" size={48} />
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Bill Generated Successfully!</h2>
                    <p className="text-slate-600 mb-4">
                        Invoice <strong className="text-emerald-600">#{generatedRef}</strong> for <strong>{selectedDealer?.businessName}</strong>
                    </p>

                    <div className="bg-emerald-50 rounded-xl p-4 mb-6 border border-emerald-100">
                        <div className="flex items-center justify-center gap-2 text-emerald-700">
                            <CheckCircle size={18} />
                            <span className="font-medium">PDF sent to dealer via WhatsApp</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left border border-slate-200">
                        <h4 className="font-semibold text-slate-700 mb-2">Invoice Summary</h4>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Subtotal</span>
                                <span className="text-slate-700">₹{subTotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Total Tax</span>
                                <span className="text-slate-700">₹{totalTax.toFixed(2)}</span>
                            </div>
                            {parseFloat(transportCharges) > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Transport</span>
                                    <span className="text-slate-700">₹{parseFloat(transportCharges).toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold pt-2 border-t border-slate-200">
                                <span className="text-slate-800">Grand Total</span>
                                <span className="text-emerald-600">₹{grandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={resetForm}
                        className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-medium hover:bg-slate-800 transition-all shadow-lg"
                    >
                        Create Another Bill
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">New Invoice</h1>
                    <p className="text-sm text-slate-500">Create bill with tax details and transport information</p>
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
                        <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                            <Users size={18} />
                            Dealer Details
                        </h3>

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
                                            <td colSpan={9} className="p-8 text-center text-slate-400 italic">No items added yet</td>
                                        </tr>
                                    ) : (
                                        invoiceItems.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-3 font-medium text-slate-700">{item.productName}</td>
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
                                    type="text"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="e.g., SV Transport"
                                    value={vehicleName}
                                    onChange={(e) => setVehicleName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Vehicle Number</label>
                                <input
                                    type="text"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="e.g., TN-01-AB-1234"
                                    value={vehicleNumber}
                                    onChange={(e) => setVehicleNumber(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Destination</label>
                                <input
                                    type="text"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="e.g., Chennai"
                                    value={destination}
                                    onChange={(e) => setDestination(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Transport Charges (₹)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="0"
                                    value={transportCharges}
                                    onChange={(e) => setTransportCharges(e.target.value.replace(/[^0-9.]/g, ''))}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Credit Days *</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="e.g., 30, 45, 60, 90"
                                    value={creditDays}
                                    onChange={(e) => setCreditDays(e.target.value.replace(/[^0-9]/g, ''))}
                                />
                                <p className="text-xs text-slate-400 mt-1">Days until payment due</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Global Discount (%)</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="0"
                                    value={globalDiscount}
                                    onChange={(e) => setGlobalDiscount(e.target.value.replace(/[^0-9.]/g, ''))}
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
                                    Confirm & Generate Bill
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Add New Dealer Modal */}
            {showAddDealerModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
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
                                    type="text"
                                    required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newDealer.businessName}
                                    onChange={e => setNewDealer({ ...newDealer, businessName: e.target.value })}
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
                                        type="tel"
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newDealer.phone}
                                        onChange={e => setNewDealer({ ...newDealer, phone: e.target.value })}
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
    );
}
