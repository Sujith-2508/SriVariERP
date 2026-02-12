'use client';

import React, { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import {
    Search, Edit2, Trash2, Plus, X, Package, ShoppingBag,
    Building2, Calendar, Receipt, ChevronDown, ChevronUp
} from 'lucide-react';
import { Product, Supplier, Purchase, PurchaseItem } from '@/types';
import { supabase } from '@/lib/supabase';

export default function Purchases() {
    const { products, refreshData } = useData();

    // Suppliers state
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // View state
    const [activeTab, setActiveTab] = useState<'purchases' | 'suppliers'>('purchases');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null);

    // Modal states
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

    // Supplier form state
    const [supplierForm, setSupplierForm] = useState({
        supplierName: '',
        contactPerson: '',
        phone: '',
        email: '',
        city: '',
        address: '',
        gstNumber: ''
    });

    // Purchase form state
    const [purchaseForm, setPurchaseForm] = useState({
        purchaseBillNo: '',
        supplierId: '',
        supplierName: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        freightCharges: 0,
        otherExpenses: 0,
        notes: ''
    });
    const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
    const [selectedProduct, setSelectedProduct] = useState('');
    const [itemQuantity, setItemQuantity] = useState(1);
    const [itemUnitPrice, setItemUnitPrice] = useState(0);

    // LocalStorage keys
    const SUPPLIERS_KEY = 'sve_suppliers';
    const PURCHASES_KEY = 'sve_purchases';

    // Helper functions for localStorage
    const getLocalSuppliers = (): Supplier[] => {
        if (typeof window === 'undefined') return [];
        const data = localStorage.getItem(SUPPLIERS_KEY);
        return data ? JSON.parse(data) : [];
    };

    const saveLocalSuppliers = (data: Supplier[]) => {
        localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(data));
    };

    const getLocalPurchases = (): Purchase[] => {
        if (typeof window === 'undefined') return [];
        const data = localStorage.getItem(PURCHASES_KEY);
        if (!data) return [];
        return JSON.parse(data).map((p: any) => ({
            ...p,
            purchaseDate: new Date(p.purchaseDate)
        }));
    };

    const saveLocalPurchases = (data: Purchase[]) => {
        localStorage.setItem(PURCHASES_KEY, JSON.stringify(data));
    };

    // Generate unique ID
    const generateId = () => crypto.randomUUID();

    // Fetch data from localStorage
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = () => {
        setIsLoading(true);
        try {
            setSuppliers(getLocalSuppliers());
            setPurchases(getLocalPurchases());
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Add/Edit supplier (localStorage)
    const handleSupplierSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const currentSuppliers = getLocalSuppliers();

            if (editingSupplier) {
                // Update existing supplier
                const updated = currentSuppliers.map(s =>
                    s.id === editingSupplier.id
                        ? { ...s, ...supplierForm }
                        : s
                );
                saveLocalSuppliers(updated);
            } else {
                // Add new supplier
                const newSupplier: Supplier = {
                    id: generateId(),
                    ...supplierForm,
                    isActive: true
                };
                saveLocalSuppliers([...currentSuppliers, newSupplier]);
            }

            setIsSupplierModalOpen(false);
            resetSupplierForm();
            fetchData();
        } catch (error) {
            console.error('Error saving supplier:', error);
            alert('Failed to save supplier');
        }
    };

    const handleDeleteSupplier = (id: string) => {
        if (!window.confirm('Are you sure you want to delete this supplier?')) return;

        try {
            const currentSuppliers = getLocalSuppliers();
            const filtered = currentSuppliers.filter(s => s.id !== id);
            saveLocalSuppliers(filtered);
            fetchData();
        } catch (error) {
            console.error('Error deleting supplier:', error);
            alert('Failed to delete supplier');
        }
    };

    // Add item to purchase
    const handleAddItem = () => {
        if (!selectedProduct || itemQuantity <= 0) return;

        const product = products.find(p => p.productId === selectedProduct);
        if (!product) return;

        const gstRate = product.gstRate * 100;
        const subtotal = itemQuantity * itemUnitPrice;
        const gstAmount = subtotal * (gstRate / 100);
        const total = subtotal + gstAmount;

        const newItem: PurchaseItem = {
            id: generateId(),
            productId: product.productId,
            productName: product.name,
            quantity: itemQuantity,
            unitPrice: itemUnitPrice,
            gstRate: gstRate,
            gstAmount: gstAmount,
            total: total,
            hsnCode: product.hsnCode,
            unit: product.unit
        };

        setPurchaseItems([...purchaseItems, newItem]);
        setSelectedProduct('');
        setItemQuantity(1);
        setItemUnitPrice(0);
    };

    const handleRemoveItem = (index: number) => {
        setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
    };

    // Submit purchase (localStorage)
    const handlePurchaseSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (purchaseItems.length === 0) {
            alert('Please add at least one item to the purchase');
            return;
        }

        try {
            const totalAmount = purchaseItems.reduce((sum, item) => sum + item.total, 0);
            const gstAmount = purchaseItems.reduce((sum, item) => sum + item.gstAmount, 0);
            const netAmount = totalAmount + purchaseForm.freightCharges + purchaseForm.otherExpenses;

            const newPurchase: Purchase = {
                id: generateId(),
                purchaseBillNo: purchaseForm.purchaseBillNo,
                supplierId: purchaseForm.supplierId || undefined,
                supplierName: purchaseForm.supplierName,
                purchaseDate: new Date(purchaseForm.purchaseDate),
                totalAmount: totalAmount,
                gstAmount: gstAmount,
                discountAmount: 0,
                freightCharges: purchaseForm.freightCharges,
                otherExpenses: purchaseForm.otherExpenses,
                netAmount: netAmount,
                paymentStatus: 'PENDING',
                notes: purchaseForm.notes,
                items: purchaseItems
            };

            const currentPurchases = getLocalPurchases();
            saveLocalPurchases([newPurchase, ...currentPurchases]);

            // Update product stock (increase by purchased quantity)
            const PRODUCTS_KEY = 'sve_products';
            const productsData = localStorage.getItem(PRODUCTS_KEY);
            if (productsData) {
                const currentProducts = JSON.parse(productsData);
                const updatedProducts = currentProducts.map((product: any) => {
                    const purchasedItem = purchaseItems.find(item => item.productId === product.productId);
                    if (purchasedItem) {
                        return { ...product, stock: product.stock + purchasedItem.quantity };
                    }
                    return product;
                });
                localStorage.setItem(PRODUCTS_KEY, JSON.stringify(updatedProducts));
            }

            setIsPurchaseModalOpen(false);
            resetPurchaseForm();
            fetchData();
            refreshData(); // Refresh products to show updated stock

        } catch (error) {
            console.error('Error creating purchase:', error);
            alert('Failed to create purchase');
        }
    };

    const handleDeletePurchase = (id: string) => {
        if (!window.confirm('Delete this purchase? Stock will be reverted.')) return;

        try {
            const currentPurchases = getLocalPurchases();
            const purchaseToDelete = currentPurchases.find(p => p.id === id);

            // Revert product stock (decrease by purchased quantity)
            if (purchaseToDelete?.items) {
                const PRODUCTS_KEY = 'sve_products';
                const productsData = localStorage.getItem(PRODUCTS_KEY);
                if (productsData) {
                    const currentProducts = JSON.parse(productsData);
                    const updatedProducts = currentProducts.map((product: any) => {
                        const purchasedItem = purchaseToDelete.items?.find(item => item.productId === product.productId);
                        if (purchasedItem) {
                            return { ...product, stock: Math.max(0, product.stock - purchasedItem.quantity) };
                        }
                        return product;
                    });
                    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(updatedProducts));
                }
            }

            const filtered = currentPurchases.filter(p => p.id !== id);
            saveLocalPurchases(filtered);
            fetchData();
            refreshData(); // Refresh products to show updated stock
        } catch (error) {
            console.error('Error deleting purchase:', error);
            alert('Failed to delete purchase');
        }
    };

    // Form resets
    const resetSupplierForm = () => {
        setEditingSupplier(null);
        setSupplierForm({
            supplierName: '',
            contactPerson: '',
            phone: '',
            email: '',
            city: '',
            address: '',
            gstNumber: ''
        });
    };

    const resetPurchaseForm = () => {
        setPurchaseForm({
            purchaseBillNo: '',
            supplierId: '',
            supplierName: '',
            purchaseDate: new Date().toISOString().split('T')[0],
            freightCharges: 0,
            otherExpenses: 0,
            notes: ''
        });
        setPurchaseItems([]);
    };

    const openEditSupplier = (supplier: Supplier) => {
        setEditingSupplier(supplier);
        setSupplierForm({
            supplierName: supplier.supplierName,
            contactPerson: supplier.contactPerson || '',
            phone: supplier.phone || '',
            email: supplier.email || '',
            city: supplier.city || '',
            address: supplier.address || '',
            gstNumber: supplier.gstNumber || ''
        });
        setIsSupplierModalOpen(true);
    };

    const openAddPurchase = () => {
        resetPurchaseForm();
        // Generate bill number
        const billNo = `PB${String(purchases.length + 1).padStart(4, '0')}`;
        setPurchaseForm(prev => ({ ...prev, purchaseBillNo: billNo }));
        setIsPurchaseModalOpen(true);
    };

    // Filter based on search
    const filteredSuppliers = suppliers.filter(s =>
        s.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.city?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredPurchases = purchases.filter(p =>
        p.purchaseBillNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.supplierName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const purchaseTotal = purchaseItems.reduce((sum, item) => sum + item.total, 0);

    return (
        <div className="p-6 h-full overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Purchase Management</h1>
                    <p className="text-sm text-slate-500">Manage suppliers and purchase bills</p>
                </div>
                <button
                    onClick={activeTab === 'purchases' ? openAddPurchase : () => { resetSupplierForm(); setIsSupplierModalOpen(true); }}
                    className="bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg"
                >
                    <Plus size={16} />
                    {activeTab === 'purchases' ? 'New Purchase' : 'Add Supplier'}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('purchases')}
                    className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'purchases'
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <ShoppingBag size={16} />
                        Purchases
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

            {/* Main Content */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Search */}
                <div className="p-4 border-b border-slate-200 flex gap-4 items-center">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder={activeTab === 'purchases' ? 'Search by bill no or supplier...' : 'Search suppliers...'}
                            className="pl-10 pr-4 py-2 border rounded-lg w-full outline-none focus:ring-2 focus:ring-emerald-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="text-sm text-slate-500">
                        {activeTab === 'purchases' ? filteredPurchases.length : filteredSuppliers.length} records
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-slate-500">Loading...</div>
                ) : activeTab === 'suppliers' ? (
                    /* Suppliers Table */
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="p-4">Supplier Name</th>
                                    <th className="p-4">Contact Person</th>
                                    <th className="p-4">Phone</th>
                                    <th className="p-4">City</th>
                                    <th className="p-4">GST Number</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSuppliers.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50">
                                        <td className="p-4 font-medium text-slate-800">{s.supplierName}</td>
                                        <td className="p-4 text-slate-600">{s.contactPerson || '-'}</td>
                                        <td className="p-4 text-slate-600">{s.phone || '-'}</td>
                                        <td className="p-4 text-slate-600">{s.city || '-'}</td>
                                        <td className="p-4 font-mono text-slate-600">{s.gstNumber || '-'}</td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-1">
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
                                ))}
                                {filteredSuppliers.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500">
                                            No suppliers found. Add your first supplier!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* Purchases Table */
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="p-4">Bill No</th>
                                    <th className="p-4">Supplier</th>
                                    <th className="p-4">Date</th>
                                    <th className="p-4 text-right">Amount</th>
                                    <th className="p-4 text-center">Status</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredPurchases.map(p => (
                                    <React.Fragment key={p.id}>
                                        <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedPurchase(expandedPurchase === p.id ? null : p.id)}>
                                            <td className="p-4 font-mono font-bold text-slate-800">
                                                <div className="flex items-center gap-2">
                                                    {expandedPurchase === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    {p.purchaseBillNo}
                                                </div>
                                            </td>
                                            <td className="p-4 font-medium text-slate-700">{p.supplierName}</td>
                                            <td className="p-4 text-slate-600">{p.purchaseDate.toLocaleDateString()}</td>
                                            <td className="p-4 text-right font-bold text-emerald-600">₹{p.totalAmount.toLocaleString()}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${p.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' :
                                                    p.paymentStatus === 'PARTIAL' ? 'bg-orange-100 text-orange-700' :
                                                        'bg-red-100 text-red-700'
                                                    }`}>
                                                    {p.paymentStatus}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleDeletePurchase(p.id)}
                                                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedPurchase === p.id && p.items && (
                                            <tr>
                                                <td colSpan={6} className="p-4 bg-slate-50">
                                                    <div className="text-xs font-medium text-slate-500 mb-2">ITEMS</div>
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="text-slate-500">
                                                                <th className="text-left py-1">Product</th>
                                                                <th className="text-center py-1">Qty</th>
                                                                <th className="text-right py-1">Unit Price</th>
                                                                <th className="text-right py-1">Total</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {p.items.map((item, idx) => (
                                                                <tr key={idx} className="border-t border-slate-200">
                                                                    <td className="py-2">{item.productName}</td>
                                                                    <td className="py-2 text-center">{item.quantity}</td>
                                                                    <td className="py-2 text-right">₹{item.unitPrice.toLocaleString()}</td>
                                                                    <td className="py-2 text-right font-medium">₹{item.total.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                    {/* Expense Summary */}
                                                    {(p.freightCharges > 0 || p.otherExpenses > 0) && (
                                                        <div className="mt-4 pt-3 border-t border-slate-300">
                                                            <div className="text-xs font-medium text-orange-600 mb-2">ADDITIONAL EXPENSES</div>
                                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                                {p.freightCharges > 0 && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-slate-600">Freight Charges:</span>
                                                                        <span className="font-medium text-orange-600">₹{p.freightCharges.toLocaleString()}</span>
                                                                    </div>
                                                                )}
                                                                {p.otherExpenses > 0 && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-slate-600">Other Expenses:</span>
                                                                        <span className="font-medium text-orange-600">₹{p.otherExpenses.toLocaleString()}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex justify-between mt-2 pt-2 border-t border-slate-200">
                                                                <span className="font-bold">Net Total:</span>
                                                                <span className="font-bold text-emerald-700">₹{p.netAmount.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                                {filteredPurchases.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500">
                                            No purchases found. Create your first purchase!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Supplier Modal */}
            {isSupplierModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsSupplierModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
                            </h2>
                            <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSupplierSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Supplier Name *</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={supplierForm.supplierName}
                                    onChange={e => setSupplierForm({ ...supplierForm, supplierName: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                                    <input
                                        type="text"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={supplierForm.contactPerson}
                                        onChange={e => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                    <input
                                        type="text"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={supplierForm.phone}
                                        onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                    <input
                                        type="text"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={supplierForm.city}
                                        onChange={e => setSupplierForm({ ...supplierForm, city: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
                                    <input
                                        type="text"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={supplierForm.gstNumber}
                                        onChange={e => setSupplierForm({ ...supplierForm, gstNumber: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                <textarea
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    rows={2}
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
                                    {editingSupplier ? 'Save Changes' : 'Add Supplier'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Purchase Modal */}
            {isPurchaseModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setIsPurchaseModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden my-8" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Receipt size={24} />
                                New Purchase Bill
                            </h2>
                            <button onClick={() => setIsPurchaseModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handlePurchaseSubmit} className="p-6 space-y-6">
                            {/* Bill Details */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Bill No *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                        value={purchaseForm.purchaseBillNo}
                                        onChange={e => setPurchaseForm({ ...purchaseForm, purchaseBillNo: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
                                    <select
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                        value={purchaseForm.supplierId}
                                        onChange={e => {
                                            const supplier = suppliers.find(s => s.id === e.target.value);
                                            setPurchaseForm({
                                                ...purchaseForm,
                                                supplierId: e.target.value,
                                                supplierName: supplier?.supplierName || ''
                                            });
                                        }}
                                    >
                                        <option value="">Select Supplier</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.supplierName}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={purchaseForm.purchaseDate}
                                        onChange={e => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Add Items */}
                            <div className="bg-slate-50 p-4 rounded-xl">
                                <h3 className="font-medium text-slate-800 mb-3">Add Products</h3>
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="col-span-2">
                                        <select
                                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none bg-white"
                                            value={selectedProduct}
                                            onChange={e => {
                                                setSelectedProduct(e.target.value);
                                                const product = products.find(p => p.productId === e.target.value);
                                                if (product) setItemUnitPrice(product.price);
                                            }}
                                        >
                                            <option value="">Select Product</option>
                                            {products.map(p => (
                                                <option key={p.id} value={p.productId}>
                                                    {p.productId} - {p.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            placeholder="Qty"
                                            className="w-20 p-2.5 border border-slate-300 rounded-lg outline-none"
                                            value={itemQuantity}
                                            onChange={e => setItemQuantity(parseInt(e.target.value) || 0)}
                                        />
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="Price"
                                            className="flex-1 p-2.5 border border-slate-300 rounded-lg outline-none"
                                            value={itemUnitPrice}
                                            onChange={e => setItemUnitPrice(parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddItem}
                                        disabled={!selectedProduct}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:bg-slate-300"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Items Table */}
                            {purchaseItems.length > 0 && (
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-100">
                                            <tr>
                                                <th className="p-3 text-left">Product</th>
                                                <th className="p-3 text-center">Qty</th>
                                                <th className="p-3 text-right">Unit Price</th>
                                                <th className="p-3 text-right">GST</th>
                                                <th className="p-3 text-right">Total</th>
                                                <th className="p-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {purchaseItems.map((item, idx) => (
                                                <tr key={idx} className="border-t">
                                                    <td className="p-3">{item.productName}</td>
                                                    <td className="p-3 text-center">{item.quantity}</td>
                                                    <td className="p-3 text-right">₹{item.unitPrice.toLocaleString()}</td>
                                                    <td className="p-3 text-right">{item.gstRate}%</td>
                                                    <td className="p-3 text-right font-medium">₹{item.total.toLocaleString()}</td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveItem(idx)}
                                                            className="text-red-500 hover:text-red-700"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50">
                                            <tr className="border-t">
                                                <td colSpan={4} className="p-3 text-right text-slate-600">Products Total:</td>
                                                <td className="p-3 text-right font-medium">₹{purchaseTotal.toLocaleString()}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {/* Additional Expenses */}
                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200">
                                <h3 className="font-medium text-orange-800 mb-3">Additional Expenses (Out of Bound)</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Freight / Transport Charges</label>
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                            value={purchaseForm.freightCharges || ''}
                                            placeholder="0"
                                            onChange={e => setPurchaseForm({ ...purchaseForm, freightCharges: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Other Expenses</label>
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                            value={purchaseForm.otherExpenses || ''}
                                            placeholder="0"
                                            onChange={e => setPurchaseForm({ ...purchaseForm, otherExpenses: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Grand Total */}
                            {purchaseItems.length > 0 && (
                                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                                    <div className="flex justify-between items-center text-sm mb-2">
                                        <span className="text-slate-600">Products Total:</span>
                                        <span>₹{purchaseTotal.toLocaleString()}</span>
                                    </div>
                                    {purchaseForm.freightCharges > 0 && (
                                        <div className="flex justify-between items-center text-sm mb-2">
                                            <span className="text-slate-600">Freight Charges:</span>
                                            <span>+ ₹{purchaseForm.freightCharges.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {purchaseForm.otherExpenses > 0 && (
                                        <div className="flex justify-between items-center text-sm mb-2">
                                            <span className="text-slate-600">Other Expenses:</span>
                                            <span>+ ₹{purchaseForm.otherExpenses.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center pt-2 border-t border-emerald-300">
                                        <span className="font-bold text-lg text-emerald-800">Grand Total:</span>
                                        <span className="font-bold text-xl text-emerald-700">
                                            ₹{(purchaseTotal + purchaseForm.freightCharges + purchaseForm.otherExpenses).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsPurchaseModalOpen(false)}
                                    className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg border border-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={purchaseItems.length === 0}
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg disabled:bg-slate-300"
                                >
                                    Save Purchase (₹{purchaseTotal.toLocaleString()})
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
