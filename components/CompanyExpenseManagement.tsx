'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CompanyExpense } from '@/types';
import {
    getExpensesByMonth,
    createCompanyExpense,
    updateCompanyExpense,
    deleteCompanyExpense
} from '@/lib/expenseService';
import { Calendar, Receipt, Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';
import { getISTDateString } from '@/lib/utils';

export default function CompanyExpenseManagement() {
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<CompanyExpense | null>(null);

    const [expenseForm, setExpenseForm] = useState({
        expenseType: 'GODOWN_RENT' as CompanyExpense['expenseType'],
        customName: '',
        amount: '' as string | number,
        date: getISTDateString(),
        notes: ''
    });

    const formRefs = [
        useRef<any>(null), // Type Selection
        useRef<HTMLInputElement>(null), // Custom Name
        useRef<HTMLInputElement>(null), // Amount
        useRef<HTMLInputElement>(null), // Date
        useRef<HTMLTextAreaElement>(null), // Notes
    ];

    const { handleKeyDown } = useEnterKeyNavigation(formRefs);

    useEffect(() => {
        loadExpenses();
    }, [selectedMonth, selectedYear]);

    const loadExpenses = async () => {
        setIsLoading(true);
        const data = await getExpensesByMonth(selectedMonth, selectedYear);
        setExpenses(data);
        setIsLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            expenseType: expenseForm.expenseType,
            customName: expenseForm.expenseType === 'OTHER' ? expenseForm.customName : undefined,
            amount: Number(expenseForm.amount) || 0,
            date: new Date(expenseForm.date),
            notes: expenseForm.notes
        };

        if (editingExpense) {
            await updateCompanyExpense(editingExpense.id, payload as any);
        } else {
            await createCompanyExpense(payload as any);
        }
        setIsModalOpen(false);
        resetForm();
        loadExpenses();
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this expense?')) {
            await deleteCompanyExpense(id);
            loadExpenses();
        }
    };

    const resetForm = () => {
        setEditingExpense(null);
        setExpenseForm({
            expenseType: 'GODOWN_RENT',
            customName: '',
            amount: '',
            date: getISTDateString(),
            notes: ''
        });
    };

    const openEdit = (expense: CompanyExpense) => {
        setEditingExpense(expense);
        setExpenseForm({
            expenseType: expense.expenseType,
            customName: expense.customName || '',
            amount: expense.amount,
            date: new Date(expense.date).toISOString().split('T')[0],
            notes: expense.notes || ''
        });
        setIsModalOpen(true);
    };

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const getExpenseLabel = (type: CompanyExpense['expenseType']) => {
        switch (type) {
            case 'GODOWN_RENT': return 'Godown Rent';
            case 'ELECTRICITY_BILL': return 'Electricity Bill';
            case 'OFFICE_RENT': return 'Office Rent';
            case 'OTHER': return 'Other';
            default: return type;
        }
    };

    const totalMonthlyAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Company Expenses</h2>
                    <p className="text-sm text-slate-500">Track general operational costs</p>
                </div>
                <button
                    onClick={() => {
                        resetForm();
                        setIsModalOpen(true);
                    }}
                    className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg"
                >
                    <Plus size={16} />
                    Add Expense
                </button>
            </div>

            {/* Filters & Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex gap-4 items-center">
                    <Calendar className="text-slate-400" size={20} />
                    <select
                        className="p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    >
                        {monthNames.map((month, idx) => (
                            <option key={idx} value={idx + 1}>{month}</option>
                        ))}
                    </select>
                    <select
                        className="p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    >
                        {[2024, 2025, 2026, 2027].map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Total Monthly</p>
                        <p className="text-2xl font-black text-emerald-800">₹{totalMonthlyAmount.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg shadow-sm">
                        <Receipt className="text-emerald-500" size={24} />
                    </div>
                </div>
            </div>

            {/* Expenses Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-slate-500">
                        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        Loading expenses...
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Expense Type</th>
                                    <th className="p-4">Description / Manual Name</th>
                                    <th className="p-4 text-right">Amount</th>
                                    <th className="p-4">Notes</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {expenses.map(expense => (
                                    <tr key={expense.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 text-slate-600">
                                            {new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${expense.expenseType === 'OTHER' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                                                }`}>
                                                {getExpenseLabel(expense.expenseType)}
                                            </span>
                                        </td>
                                        <td className="p-4 font-medium text-slate-800">
                                            {expense.customName || '-'}
                                        </td>
                                        <td className="p-4 text-right font-bold text-slate-900">
                                            ₹{expense.amount.toLocaleString()}
                                        </td>
                                        <td className="p-4 text-slate-500 italic max-w-xs truncate">
                                            {expense.notes || '-'}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => openEdit(expense)}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(expense.id)}
                                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {expenses.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-12 text-center text-slate-400">
                                            <Receipt size={48} className="mx-auto mb-3 opacity-20" />
                                            <p>No expenses recorded for this month.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Expense Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">
                                    {editingExpense ? 'Edit Expense' : 'Add Expense'}
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">Fill in the details below</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Expense Type *</label>
                                <select
                                    ref={formRefs[0]}
                                    onKeyDown={handleKeyDown}
                                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium"
                                    value={expenseForm.expenseType}
                                    onChange={e => setExpenseForm({ ...expenseForm, expenseType: e.target.value as any })}
                                    required
                                >
                                    <option value="GODOWN_RENT">Godown Rent</option>
                                    <option value="ELECTRICITY_BILL">Electricity Bill</option>
                                    <option value="OFFICE_RENT">Office Rent</option>
                                    <option value="OTHER">Other (Enter Manual Name)</option>
                                </select>
                            </div>

                            {expenseForm.expenseType === 'OTHER' && (
                                <div className="animate-in slide-in-from-top-2 duration-200">
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Manual Expense Name *</label>
                                    <input
                                        ref={formRefs[1]}
                                        onKeyDown={handleKeyDown}
                                        type="text"
                                        required
                                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-slate-400 font-medium"
                                        placeholder="e.g. Stationery, Repairs"
                                        value={expenseForm.customName}
                                        onChange={e => setExpenseForm({ ...expenseForm, customName: e.target.value })}
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Amount (₹) *</label>
                                    <input
                                        ref={formRefs[2]}
                                        onKeyDown={handleKeyDown}
                                        type="number"
                                        required
                                        min="0"
                                        step="0.01"
                                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
                                        value={expenseForm.amount}
                                        onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date *</label>
                                    <input
                                        ref={formRefs[3]}
                                        onKeyDown={handleKeyDown}
                                        type="date"
                                        required
                                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                                        value={expenseForm.date}
                                        onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notes</label>
                                <textarea
                                    ref={formRefs[4]}
                                    onKeyDown={handleKeyDown}
                                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-slate-400 min-h-[80px]"
                                    placeholder="Add any additional details here..."
                                    rows={3}
                                    value={expenseForm.notes}
                                    onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    <Check size={18} />
                                    {editingExpense ? 'Save Changes' : 'Add Expense'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
