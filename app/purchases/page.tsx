'use client';

import React, { useState, useEffect } from 'react';
import {
    SupplierData,
    PurchaseBillData,
    PurchasePaymentData
} from '@/types';
import {
    getAllSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    createPurchaseBill,
    getPurchaseBills,
    createPurchasePayment,
    getPurchasePayments,
    getSupplierStatement,
    SupplierStatementEntry
} from '@/lib/purchaseService';
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
    DollarSign
} from 'lucide-react';

type TabType = 'bills' | 'payments' | 'suppliers';

export default function PurchasesPageNew() {
    const [activeTab, setActiveTab] = useState<TabType>('bills');
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Data states
    const [suppliers, setSuppliers] = useState<SupplierData[]>([]);
    const [bills, setBills] = useState<PurchaseBillData[]>([]);
    const [payments, setPayments] = useState<PurchasePaymentData[]>([]);

    // Modal states
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isBillModalOpen, setIsBillModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);

    const [editingSupplier, setEditingSupplier] = useState<SupplierData | null>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<SupplierData | null>(null);
    const [statementData, setStatementData] = useState<SupplierStatementEntry[]>([]);

    // Form states
    const [supplierForm, setSupplierForm] = useState({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        gstNumber: ''
    });

    const [billForm, setBillForm] = useState({
        supplierId: '',
        billNumber: '',
        billDate: new Date().toISOString().split('T')[0],
        amount: 0,
        dueDate: '',
        notes: ''
    });

    const [paymentForm, setPaymentForm] = useState({
        supplierId: '',
        paymentNumber: '',
        paymentDate: new Date().toISOString().split('T')[0],
        amount: 0,
        paymentMode: 'CASH' as const,
        referenceNumber: '',
        notes: ''
    });

    // Load data
    useEffect(() => {
        loadData();
    }, []);

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

    // Supplier operations
    const handleSupplierSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingSupplier) {
            await updateSupplier(editingSupplier.id, supplierForm);
        } else {
            await createSupplier(supplierForm);
        }
        setIsSupplierModalOpen(false);
        resetSupplierForm();
        loadData();
    };

    const handleDeleteSupplier = async (id: string) => {
        if (!confirm('Delete this supplier?')) return;
        await deleteSupplier(id);
        loadData();
    };

    const resetSupplierForm = () => {
        setEditingSupplier(null);
        setSupplierForm({
            name: '',
            contactPerson: '',
            phone: '',
            email: '',
            address: '',
            city: '',
            gstNumber: ''
        });
    };

    const openEditSupplier = (supplier: SupplierData) => {
        setEditingSupplier(supplier);
        setSupplierForm({
            name: supplier.name,
            contactPerson: supplier.contactPerson || '',
            phone: supplier.phone || '',
            email: supplier.email || '',
            address: supplier.address || '',
            city: supplier.city || '',
            gstNumber: supplier.gstNumber || ''
        });
        setIsSupplierModalOpen(true);
    };

    // Bill operations
    const handleBillSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await createPurchaseBill({
            supplierId: billForm.supplierId,
            billNumber: billForm.billNumber,
            billDate: new Date(billForm.billDate),
            amount: billForm.amount,
            dueDate: billForm.dueDate ? new Date(billForm.dueDate) : undefined,
            notes: billForm.notes
        });
        setIsBillModalOpen(false);
        resetBillForm();
        loadData();
    };

    const resetBillForm = () => {
        setBillForm({
            supplierId: '',
            billNumber: '',
            billDate: new Date().toISOString().split('T')[0],
            amount: 0,
            dueDate: '',
            notes: ''
        });
    };

    // Payment operations
    const handlePaymentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await createPurchasePayment({
            supplierId: paymentForm.supplierId,
            paymentNumber: paymentForm.paymentNumber,
            paymentDate: new Date(paymentForm.paymentDate),
            amount: paymentForm.amount,
            paymentMode: paymentForm.paymentMode,
            referenceNumber: paymentForm.referenceNumber,
            notes: paymentForm.notes
        });
        setIsPaymentModalOpen(false);
        resetPaymentForm();
        loadData();
    };

    const resetPaymentForm = () => {
        setPaymentForm({
            supplierId: '',
            paymentNumber: '',
            paymentDate: new Date().toISOString().split('T')[0],
            amount: 0,
            paymentMode: 'CASH',
            referenceNumber: '',
            notes: ''
        });
    };

    // Statement
    const viewStatement = async (supplier: SupplierData) => {
        setSelectedSupplier(supplier);
        const statement = await getSupplierStatement(supplier.id);
        setStatementData(statement);
        setIsStatementModalOpen(true);
    };

    // Filtering
    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.city?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredBills = bills.filter(b => {
        const supplier = suppliers.find(s => s.id === b.supplierId);
        return b.billNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            supplier?.name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const filteredPayments = payments.filter(p => {
        const supplier = suppliers.find(s => s.id === p.supplierId);
        return p.paymentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            supplier?.name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
        <div className="p-6 h-full overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Purchase Management</h1>
                    <p className="text-sm text-slate-500">Track suppliers, bills, and payments</p>
                </div>
                <button
                    onClick={() => {
                        if (activeTab === 'suppliers') {
                            resetSupplierForm();
                            setIsSupplierModalOpen(true);
                        } else if (activeTab === 'bills') {
                            resetBillForm();
                            setIsBillModalOpen(true);
                        } else {
                            resetPaymentForm();
                            setIsPaymentModalOpen(true);
                        }
                    }}
                    className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg"
                >
                    <Plus size={16} />
                    {activeTab === 'suppliers' ? 'Add Supplier' : activeTab === 'bills' ? 'New Bill' : 'New Payment'}
                </button>
            </div>

            {/* Tabs */}
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

            {/* Content */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Search */}
                <div className="p-4 border-b border-slate-200 flex gap-4 items-center">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input
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
                    /* Suppliers Table */
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
                                {filteredSuppliers.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50">
                                        <td className="p-4 font-medium text-slate-800">{s.name}</td>
                                        <td className="p-4 text-slate-600">{s.contactPerson || '-'}</td>
                                        <td className="p-4 text-slate-600">{s.phone || '-'}</td>
                                        <td className="p-4 text-slate-600">{s.city || '-'}</td>
                                        <td className="p-4 text-right font-bold text-red-600">₹{s.balance.toLocaleString()}</td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-1">
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
                ) : activeTab === 'bills' ? (
                    /* Bills Table */
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
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredBills.map(b => {
                                    const supplier = suppliers.find(s => s.id === b.supplierId);
                                    return (
                                        <tr key={b.id} className="hover:bg-slate-50">
                                            <td className="p-4 font-mono font-bold text-slate-800">{b.billNumber}</td>
                                            <td className="p-4 font-medium text-slate-700">{supplier?.name}</td>
                                            <td className="p-4 text-slate-600">{b.billDate.toLocaleDateString()}</td>
                                            <td className="p-4 text-right font-medium">₹{b.amount.toLocaleString()}</td>
                                            <td className="p-4 text-right text-green-600">₹{b.paidAmount.toLocaleString()}</td>
                                            <td className="p-4 text-right font-bold text-red-600">₹{b.balance.toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                                {filteredBills.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500">
                                            No bills found. Create your first purchase bill!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* Payments Table */
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="p-4">Payment No</th>
                                    <th className="p-4">Supplier</th>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Mode</th>
                                    <th className="p-4 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredPayments.map(p => {
                                    const supplier = suppliers.find(s => s.id === p.supplierId);
                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50">
                                            <td className="p-4 font-mono font-bold text-slate-800">{p.paymentNumber}</td>
                                            <td className="p-4 font-medium text-slate-700">{supplier?.name}</td>
                                            <td className="p-4 text-slate-600">{p.paymentDate.toLocaleDateString()}</td>
                                            <td className="p-4">
                                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                                    {p.paymentMode}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-bold text-green-600">₹{p.amount.toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                                {filteredPayments.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500">
                                            No payments found. Record your first payment!
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
                                    value={supplierForm.name}
                                    onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
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

            {/* Bill Modal */}
            {isBillModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsBillModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold text-slate-800">New Purchase Bill</h2>
                            <button onClick={() => setIsBillModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleBillSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
                                <select
                                    required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                    value={billForm.supplierId}
                                    onChange={e => setBillForm({ ...billForm, supplierId: e.target.value })}
                                >
                                    <option value="">Select Supplier</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Bill Number *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={billForm.billNumber}
                                        onChange={e => setBillForm({ ...billForm, billNumber: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={billForm.amount}
                                        onChange={e => setBillForm({ ...billForm, amount: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Bill Date *</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={billForm.billDate}
                                        onChange={e => setBillForm({ ...billForm, billDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                                    <input
                                        type="date"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={billForm.dueDate}
                                        onChange={e => setBillForm({ ...billForm, dueDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                <textarea
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    rows={2}
                                    value={billForm.notes}
                                    onChange={e => setBillForm({ ...billForm, notes: e.target.value })}
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsBillModalOpen(false)}
                                    className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg border border-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg"
                                >
                                    Create Bill
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsPaymentModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold text-slate-800">New Payment</h2>
                            <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
                                <select
                                    required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                    value={paymentForm.supplierId}
                                    onChange={e => setPaymentForm({ ...paymentForm, supplierId: e.target.value })}
                                >
                                    <option value="">Select Supplier</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} (₹{s.balance.toLocaleString()})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Number *</label>
                                    <input
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
                                        type="number"
                                        required
                                        min="0"
                                        step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={paymentForm.amount}
                                        onChange={e => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={paymentForm.paymentDate}
                                        onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Mode *</label>
                                    <select
                                        required
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                        value={paymentForm.paymentMode}
                                        onChange={e => setPaymentForm({ ...paymentForm, paymentMode: e.target.value as any })}
                                    >
                                        <option value="CASH">Cash</option>
                                        <option value="CHEQUE">Cheque</option>
                                        <option value="BANK_TRANSFER">Bank Transfer</option>
                                        <option value="UPI">UPI</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
                                <input
                                    type="text"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={paymentForm.referenceNumber}
                                    onChange={e => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                <textarea
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
                                    Record Payment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Statement Modal */}
            {isStatementModalOpen && selectedSupplier && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsStatementModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">{selectedSupplier.name}</h2>
                                <p className="text-sm text-slate-500">Supplier Statement</p>
                            </div>
                            <button onClick={() => setIsStatementModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 max-h-[600px] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="p-3 text-left">Date</th>
                                        <th className="p-3 text-left">Type</th>
                                        <th className="p-3 text-left">Reference</th>
                                        <th className="p-3 text-right">Debit</th>
                                        <th className="p-3 text-right">Credit</th>
                                        <th className="p-3 text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {statementData.map((entry, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-3">{entry.date.toLocaleDateString()}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${entry.type === 'BILL' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                                    }`}>
                                                    {entry.type}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono">{entry.reference}</td>
                                            <td className="p-3 text-right text-red-600">{entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : '-'}</td>
                                            <td className="p-3 text-right text-green-600">{entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : '-'}</td>
                                            <td className="p-3 text-right font-bold">{`₹${entry.balance.toLocaleString()}`}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
