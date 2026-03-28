'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CompanyExpense } from '@/types';
import {
    getExpensesByMonth,
    getExpensesByYear,
    getExpensesByRange,
    getAllExpenses,
    createCompanyExpense,
    updateCompanyExpense,
    deleteCompanyExpense
} from '@/lib/expenseService';
import { generateExpenseReportPDF } from '@/lib/pdfGenerator';
import { Calendar, Receipt, Plus, Edit2, Trash2, X, Check, Download, CalendarDays, CalendarRange, LayoutGrid } from 'lucide-react';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmationContext';
import { useData } from '@/contexts/DataContext';
import { getISTDateString } from '@/lib/utils';

type ExpenseExportOption = 'complete' | 'financial_year' | 'by_month' | 'custom_range';

export default function CompanyExpenseManagement() {
    const { showToast } = useToast();
    const { showConfirm } = useConfirm();
    const { companySettings } = useData();
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [showExportModal, setShowExportModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportOption, setExportOption] = useState<ExpenseExportOption>('by_month');
    const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
    const [exportYear, setExportYear] = useState(new Date().getFullYear());
    const [exportFromMonth, setExportFromMonth] = useState(1);
    const [exportFromYear, setExportFromYear] = useState(new Date().getFullYear());
    const [exportToMonth, setExportToMonth] = useState(new Date().getMonth() + 1);
    const [exportToYear, setExportToYear] = useState(new Date().getFullYear());
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
        const confirmed = await showConfirm({
            title: 'Delete Expense',
            message: 'Are you sure you want to delete this expense? This action cannot be undone.',
            confirmLabel: 'Delete',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await deleteCompanyExpense(id);
                showToast('Expense deleted successfully', 'success');
                loadExpenses();
            } catch (error) {
                console.error('Error deleting expense:', error);
                showToast('Failed to delete expense', 'error');
            }
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

    // ── Modal Export Handler ──────────────────────────────────────────
    const handleExport = async () => {
        setIsExporting(true);
        try {
            let data: CompanyExpense[] = [];
            let label = '';
            const monthNames2 = monthNames;

            if (exportOption === 'complete') {
                data = await getAllExpenses();
                label = 'All Time';
            } else if (exportOption === 'financial_year') {
                const start = new Date(exportYear, 3, 1);
                const end = new Date(exportYear + 1, 2, 31, 23, 59, 59);
                data = await getExpensesByRange(start, end);
                label = `FY ${exportYear}-${String(exportYear + 1).slice(-2)}`;
            } else if (exportOption === 'by_month') {
                data = await getExpensesByMonth(exportMonth, exportYear);
                label = `${monthNames2[exportMonth - 1]} ${exportYear}`;
            } else if (exportOption === 'custom_range') {
                data = await getExpensesByRange(
                    new Date(exportFromYear, exportFromMonth - 1, 1),
                    new Date(exportToYear, exportToMonth, 0)
                );
                label = `${monthNames2[exportFromMonth - 1]} ${exportFromYear} – ${monthNames2[exportToMonth - 1]} ${exportToYear}`;
            }

            if (data.length === 0) {
                showToast('No expenses found for the selected period', 'warning');
                return;
            }
            generateExpenseReportPDF(data as any[], companySettings, label);
            setShowExportModal(false);
        } finally {
            setIsExporting(false);
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
                <div className="flex items-center gap-2">
                    {/* Export PDF Button */}
                    <button
                        onClick={() => { setExportMonth(selectedMonth); setExportYear(selectedYear); setShowExportModal(true); }}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <Download size={15} />
                        {isExporting ? 'Exporting...' : 'Export PDF'}
                    </button>
                    <button
                        onClick={() => { resetForm(); setIsModalOpen(true); }}
                        className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg"
                    >
                        <Plus size={16} />
                        Add Expense
                    </button>
                </div>
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
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
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

            {/* Export PDF Modal */}
            <ExportExpenseModal
                open={showExportModal}
                onClose={() => setShowExportModal(false)}
                onExport={handleExport}
                isExporting={isExporting}
                exportOption={exportOption}
                setExportOption={setExportOption}
                exportMonth={exportMonth}
                setExportMonth={setExportMonth}
                exportYear={exportYear}
                setExportYear={setExportYear}
                exportFromMonth={exportFromMonth}
                setExportFromMonth={setExportFromMonth}
                exportFromYear={exportFromYear}
                setExportFromYear={setExportFromYear}
                exportToMonth={exportToMonth}
                setExportToMonth={setExportToMonth}
                exportToYear={exportToYear}
                setExportToYear={setExportToYear}
                monthNames={monthNames}
            />
        </div>
    );
}

// ============================================================
// ExportExpenseModal — Card-based PDF export modal
// ============================================================
function ExportExpenseModal({
    open, onClose, onExport, isExporting,
    exportOption, setExportOption,
    exportMonth, setExportMonth,
    exportYear, setExportYear,
    exportFromMonth, setExportFromMonth,
    exportFromYear, setExportFromYear,
    exportToMonth, setExportToMonth,
    exportToYear, setExportToYear,
    monthNames,
}: any) {
    if (!open) return null;

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).reverse();
    const months = monthNames;

    const cards: { id: ExpenseExportOption; icon: React.ReactNode; label: string; sub: string }[] = [
        { id: 'complete', icon: <LayoutGrid size={22} />, label: 'Complete Statement', sub: 'All time records' },
        { id: 'financial_year', icon: <CalendarDays size={22} />, label: 'Financial Year', sub: 'Full year expenses' },
        { id: 'by_month', icon: <Calendar size={22} />, label: 'By Month', sub: 'Specific month' },
        { id: 'custom_range', icon: <CalendarRange size={22} />, label: 'Custom Range', sub: 'Select from–to months' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center">
                            <Download size={18} className="text-white" />
                        </div>
                        <div>
                            <p className="font-bold text-white text-base">Export Expense Statement</p>
                            <p className="text-slate-400 text-xs">For Company Expenses PDF</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={22} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* 4 Option Cards */}
                    <div className="grid grid-cols-2 gap-3">
                        {cards.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setExportOption(c.id)}
                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center ${
                                    exportOption === c.id
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
                                }`}
                            >
                                <span className={exportOption === c.id ? 'text-emerald-600' : 'text-slate-400'}>{c.icon}</span>
                                <span className="font-semibold text-sm leading-tight">{c.label}</span>
                                <span className="text-xs text-slate-400">{c.sub}</span>
                            </button>
                        ))}
                    </div>

                    {/* Dynamic Sub-fields */}
                    {exportOption === 'financial_year' && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Financial Year</label>
                            <select className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                value={exportYear} onChange={e => setExportYear(Number(e.target.value))}>
                                {years.map(y => (
                                    <option key={y} value={y}>
                                        FY {y}-{String(y + 1).slice(-2)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {exportOption === 'by_month' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Month</label>
                                <select className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                    value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}>
                                    {months.map((m: string, i: number) => <option key={i} value={i + 1}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Year</label>
                                <select className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                    value={exportYear} onChange={e => setExportYear(Number(e.target.value))}>
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                    {exportOption === 'custom_range' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">From</label>
                                <select className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm mb-1"
                                    value={exportFromMonth} onChange={e => setExportFromMonth(Number(e.target.value))}>
                                    {months.map((m: string, i: number) => <option key={i} value={i + 1}>{m}</option>)}
                                </select>
                                <select className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                    value={exportFromYear} onChange={e => setExportFromYear(Number(e.target.value))}>
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To</label>
                                <select className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm mb-1"
                                    value={exportToMonth} onChange={e => setExportToMonth(Number(e.target.value))}>
                                    {months.map((m: string, i: number) => <option key={i} value={i + 1}>{m}</option>)}
                                </select>
                                <select className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                    value={exportToYear} onChange={e => setExportToYear(Number(e.target.value))}>
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button onClick={onClose} className="flex-1 py-3 font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={onExport}
                            disabled={isExporting}
                            className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Download size={16} />
                            {isExporting ? 'Exporting...' : 'Export Expenses'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
