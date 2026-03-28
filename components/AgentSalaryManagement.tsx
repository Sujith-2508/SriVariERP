'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Agent, AgentSalaryData } from '@/types';
import {
    createSalaryRecord,
    updateSalaryRecord,
    markSalaryPaid,
    getSalaryByMonth,
    getSalaryByAgent,
    getAllSalariesByYear,
    getSalaryByRange,
} from '@/lib/salaryService';
import { generateSalaryReportPDF } from '@/lib/pdfGenerator';
import { Calendar, DollarSign, Plus, Edit2, Check, X, Download, CalendarDays, CalendarRange, Pencil, LayoutGrid } from 'lucide-react';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';
import { useData } from '@/contexts/DataContext';

type ExportOption = 'complete' | 'financial_year' | 'by_month' | 'custom_range';

interface AgentSalaryManagementProps {
    agents: Agent[];
}

export default function AgentSalaryManagement({ agents }: AgentSalaryManagementProps) {
    const { companySettings } = useData();
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [salaries, setSalaries] = useState<AgentSalaryData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSalary, setEditingSalary] = useState<AgentSalaryData | null>(null);

    // Export modal state
    const [showExportModal, setShowExportModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportOption, setExportOption] = useState<ExportOption>('by_month');
    const [exportAgentMode, setExportAgentMode] = useState<'all' | 'specific'>('all');
    const [exportAgentId, setExportAgentId] = useState('');
    const [exportMonth, setExportMonth] = useState(selectedMonth);
    const [exportYear, setExportYear] = useState(selectedYear);
    const [exportFromMonth, setExportFromMonth] = useState(1);
    const [exportFromYear, setExportFromYear] = useState(selectedYear);
    const [exportToMonth, setExportToMonth] = useState(new Date().getMonth() + 1);
    const [exportToYear, setExportToYear] = useState(selectedYear);

    const [salaryForm, setSalaryForm] = useState({
        agentId: '',
        baseSalary: '' as string | number,
        travelExpense: '' as string | number,
        stayExpense: '' as string | number,
        foodExpense: '' as string | number,
        otherExpense: '' as string | number,
        notes: ''
    });

    const formRefs = [
        useRef<any>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLTextAreaElement>(null),
    ];

    const { handleKeyDown } = useEnterKeyNavigation(formRefs);

    useEffect(() => {
        loadSalaries();
    }, [selectedMonth, selectedYear]);

    const loadSalaries = async () => {
        setIsLoading(true);
        const data = await getSalaryByMonth(selectedMonth, selectedYear);
        setSalaries(data);
        setIsLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            agentId: salaryForm.agentId,
            month: selectedMonth,
            year: selectedYear,
            baseSalary: Number(salaryForm.baseSalary) || 0,
            travelExpense: Number(salaryForm.travelExpense) || 0,
            stayExpense: Number(salaryForm.stayExpense) || 0,
            foodExpense: Number(salaryForm.foodExpense) || 0,
            otherExpense: Number(salaryForm.otherExpense) || 0,
            notes: salaryForm.notes
        };

        if (editingSalary) {
            await updateSalaryRecord(editingSalary.id, payload);
        } else {
            await createSalaryRecord(payload);
        }
        setIsModalOpen(false);
        resetForm();
        loadSalaries();
    };

    const handleMarkPaid = async (salaryId: string) => {
        await markSalaryPaid(salaryId, new Date());
        loadSalaries();
    };

    const resetForm = () => {
        setEditingSalary(null);
        setSalaryForm({
            agentId: '',
            baseSalary: '',
            travelExpense: '',
            stayExpense: '',
            foodExpense: '',
            otherExpense: '',
            notes: ''
        });
    };

    const openEdit = (salary: AgentSalaryData) => {
        setEditingSalary(salary);
        setSalaryForm({
            agentId: salary.agentId,
            baseSalary: salary.baseSalary,
            travelExpense: salary.travelExpense,
            stayExpense: salary.stayExpense,
            foodExpense: salary.foodExpense,
            otherExpense: salary.otherExpense,
            notes: salary.notes || ''
        });
        setIsModalOpen(true);
    };

    // ── Modal Export Handler ──────────────────────────────────────────
    const handleExport = async () => {
        setIsExporting(true);
        try {
            const agentList = agents.map(a => ({ id: a.id, name: a.name, phone: a.phone, division: a.division }));
            const agentIdFilter = exportAgentMode === 'specific' ? exportAgentId : undefined;

            let data: AgentSalaryData[] = [];
            let opts: { agentId?: string; month?: number; year: number; customLabel?: string } = { year: exportYear };

            if (exportOption === 'complete') {
                // All records for specific or all agents
                if (agentIdFilter) {
                    data = await getSalaryByAgent(agentIdFilter);
                } else {
                    data = await getAllSalariesByYear(new Date().getFullYear()); // Basic all logic
                }
                opts = { agentId: agentIdFilter, year: new Date().getFullYear(), customLabel: 'Complete Statement' };
            } else if (exportOption === 'financial_year') {
                const start = new Date(exportYear, 3, 1);
                const end = new Date(exportYear + 1, 2, 31, 23, 59, 59);
                const fyLabel = `FY ${exportYear}-${String(exportYear + 1).slice(-2)}`;
                
                data = await getSalaryByRange(start, end);
                opts = { agentId: agentIdFilter, year: exportYear, customLabel: fyLabel };
            } else if (exportOption === 'by_month') {
                if (agentIdFilter) {
                    data = (await getSalaryByAgent(agentIdFilter)).filter(s => s.month === exportMonth && s.year === exportYear);
                } else {
                    data = await getSalaryByMonth(exportMonth, exportYear);
                }
                opts = { agentId: agentIdFilter, month: exportMonth, year: exportYear };
            } else if (exportOption === 'custom_range') {
                const fromAbs = exportFromYear * 12 + exportFromMonth;
                const toAbs = exportToYear * 12 + exportToMonth;
                if (agentIdFilter) {
                    data = (await getSalaryByAgent(agentIdFilter)).filter(s => {
                        const abs = s.year * 12 + s.month;
                        return abs >= fromAbs && abs <= toAbs;
                    });
                } else {
                    const all: AgentSalaryData[] = [];
                    for (const a of agents) all.push(...(await getSalaryByAgent(a.id)));
                    data = all.filter(s => {
                        const abs = s.year * 12 + s.month;
                        return abs >= fromAbs && abs <= toAbs;
                    });
                }
                opts = { agentId: agentIdFilter, year: exportFromYear };
            }

            generateSalaryReportPDF(agentList, data as any[], companySettings, opts);
            setShowExportModal(false);
        } finally {
            setIsExporting(false);
        }
    };

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const getNumValue = (val: string | number) => Number(val) || 0;
    const totalExpense = getNumValue(salaryForm.travelExpense) + getNumValue(salaryForm.stayExpense) + getNumValue(salaryForm.foodExpense) + getNumValue(salaryForm.otherExpense);
    const netSalary = getNumValue(salaryForm.baseSalary) + totalExpense;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Salary Management</h2>
                    <p className="text-sm text-slate-500">Manage agent salaries and expenses</p>
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
                        Add Salary
                    </button>
                </div>
            </div>

            {/* Month/Year Selector */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex gap-4 items-center">
                    <Calendar className="text-slate-400" size={20} />
                    <select
                        className="p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    >
                        {monthNames.map((month, idx) => (
                            <option key={idx} value={idx + 1}>{month}</option>
                        ))}
                    </select>
                    <select
                        className="p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    >
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Salaries Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-slate-500">
                        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        Loading salaries...
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="p-4">Agent</th>
                                    <th className="p-4 text-right">Base Salary</th>
                                    <th className="p-4 text-right">Travel</th>
                                    <th className="p-4 text-right">Stay</th>
                                    <th className="p-4 text-right">Food</th>
                                    <th className="p-4 text-right">Other</th>
                                    <th className="p-4 text-right">Net Salary</th>
                                    <th className="p-4 text-center">Status</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {salaries.map(salary => {
                                    const agent = agents.find(a => a.id === salary.agentId);
                                    return (
                                        <tr key={salary.id} className="hover:bg-slate-50">
                                            <td className="p-4 font-medium text-slate-800">{agent?.name || 'Unknown'}</td>
                                            <td className="p-4 text-right">₹{salary.baseSalary.toLocaleString()}</td>
                                            <td className="p-4 text-right text-orange-600">₹{salary.travelExpense.toLocaleString()}</td>
                                            <td className="p-4 text-right text-orange-600">₹{salary.stayExpense.toLocaleString()}</td>
                                            <td className="p-4 text-right text-orange-600">₹{salary.foodExpense.toLocaleString()}</td>
                                            <td className="p-4 text-right text-orange-600">₹{salary.otherExpense.toLocaleString()}</td>
                                            <td className="p-4 text-right font-bold text-emerald-600">₹{salary.netSalary.toLocaleString()}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${salary.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {salary.paymentStatus}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button onClick={() => openEdit(salary)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    {salary.paymentStatus === 'PENDING' && (
                                                        <button onClick={() => handleMarkPaid(salary.id)} className="p-2 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Mark as Paid">
                                                            <Check size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {salaries.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="p-8 text-center text-slate-500">
                                            <DollarSign size={40} className="mx-auto mb-3 opacity-20" />
                                            No salary records for {monthNames[selectedMonth - 1]} {selectedYear}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {salaries.length > 0 && (
                                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                    <tr>
                                        <td className="p-4 font-bold text-slate-700">Total ({salaries.length})</td>
                                        <td className="p-4 text-right font-bold">₹{salaries.reduce((sum, s) => sum + s.baseSalary, 0).toLocaleString()}</td>
                                        <td className="p-4 text-right font-bold text-orange-600">₹{salaries.reduce((sum, s) => sum + s.travelExpense, 0).toLocaleString()}</td>
                                        <td className="p-4 text-right font-bold text-orange-600">₹{salaries.reduce((sum, s) => sum + s.stayExpense, 0).toLocaleString()}</td>
                                        <td className="p-4 text-right font-bold text-orange-600">₹{salaries.reduce((sum, s) => sum + s.foodExpense, 0).toLocaleString()}</td>
                                        <td className="p-4 text-right font-bold text-orange-600">₹{salaries.reduce((sum, s) => sum + s.otherExpense, 0).toLocaleString()}</td>
                                        <td className="p-4 text-right font-bold text-emerald-700 text-base">₹{salaries.reduce((sum, s) => sum + s.netSalary, 0).toLocaleString()}</td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
            </div>

            {/* Salary Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingSalary ? 'Edit Salary' : 'Add Salary'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Agent *</label>
                                <select
                                    ref={formRefs[0]}
                                    onKeyDown={handleKeyDown}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                    value={salaryForm.agentId}
                                    onChange={e => setSalaryForm({ ...salaryForm, agentId: e.target.value })}
                                    required
                                    disabled={!!editingSalary}
                                >
                                    <option value="">Select Agent</option>
                                    {agents.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Base Salary *</label>
                                    <input ref={formRefs[1]} onKeyDown={handleKeyDown} type="number" required min="0" step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={salaryForm.baseSalary} onChange={e => setSalaryForm({ ...salaryForm, baseSalary: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Travel Expense</label>
                                    <input ref={formRefs[2]} onKeyDown={handleKeyDown} type="number" min="0" step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={salaryForm.travelExpense} onChange={e => setSalaryForm({ ...salaryForm, travelExpense: e.target.value })} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Stay Expense</label>
                                    <input ref={formRefs[3]} onKeyDown={handleKeyDown} type="number" min="0" step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={salaryForm.stayExpense} onChange={e => setSalaryForm({ ...salaryForm, stayExpense: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Food Expense</label>
                                    <input ref={formRefs[4]} onKeyDown={handleKeyDown} type="number" min="0" step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={salaryForm.foodExpense} onChange={e => setSalaryForm({ ...salaryForm, foodExpense: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Other Expense</label>
                                <input ref={formRefs[5]} onKeyDown={handleKeyDown} type="number" min="0" step="0.01"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={salaryForm.otherExpense} onChange={e => setSalaryForm({ ...salaryForm, otherExpense: e.target.value })} />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                <textarea ref={formRefs[6]} onKeyDown={handleKeyDown}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    rows={2} value={salaryForm.notes} onChange={e => setSalaryForm({ ...salaryForm, notes: e.target.value })} />
                            </div>

                            {/* Summary */}
                            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Total Expenses:</span>
                                        <span className="font-bold text-orange-600">₹{totalExpense.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600 font-bold">Net Salary:</span>
                                        <span className="font-bold text-emerald-700 text-lg">₹{netSalary.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg border border-slate-200">
                                    Cancel
                                </button>
                                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg">
                                    {editingSalary ? 'Save Changes' : 'Add Salary'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Export PDF Modal */}
            <ExportSalaryModal
                open={showExportModal}
                onClose={() => setShowExportModal(false)}
                onExport={handleExport}
                isExporting={isExporting}
                exportOption={exportOption}
                setExportOption={setExportOption}
                exportAgentMode={exportAgentMode}
                setExportAgentMode={setExportAgentMode}
                exportAgentId={exportAgentId}
                setExportAgentId={setExportAgentId}
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
                agents={agents}
                monthNames={monthNames}
            />
        </div>
    );
}

// ============================================================
// ExportSalaryModal — Card-based PDF export modal
// ============================================================
function ExportSalaryModal({
    open, onClose, onExport, isExporting,
    exportOption, setExportOption,
    exportAgentMode, setExportAgentMode,
    exportAgentId, setExportAgentId,
    exportMonth, setExportMonth,
    exportYear, setExportYear,
    exportFromMonth, setExportFromMonth,
    exportFromYear, setExportFromYear,
    exportToMonth, setExportToMonth,
    exportToYear, setExportToYear,
    agents, monthNames,
}: any) {
    if (!open) return null;

    const months = monthNames;
    const currentYear = new Date().getFullYear();
    const startYear = 2022;
    const years = Array.from({ length: (currentYear + 15) - startYear + 1 }, (_, i) => startYear + i).reverse();

    const cards: { id: ExportOption; icon: React.ReactNode; label: string; sub: string }[] = [
        { id: 'complete', icon: <LayoutGrid size={22} />, label: 'Complete Statement', sub: 'All salary records' },
        { id: 'financial_year', icon: <CalendarDays size={22} />, label: 'Financial Year', sub: 'All months in a year' },
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
                            <p className="font-bold text-white text-base">Export Salary Report</p>
                            <p className="text-slate-400 text-xs">For Agent Salary PDF</p>
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
                            <select className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-sm"
                                value={exportYear} onChange={e => setExportYear(Number(e.target.value))}>
                                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
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
                                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
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
                                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
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
                                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Agent Filter */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Agent Filter</label>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <button onClick={() => setExportAgentMode('all')}
                                className={`py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                                    exportAgentMode === 'all' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-emerald-300'
                                }`}>
                                All Agents
                            </button>
                            <button onClick={() => setExportAgentMode('specific')}
                                className={`py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                                    exportAgentMode === 'specific' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-emerald-300'
                                }`}>
                                Specific Agent
                            </button>
                        </div>
                        {exportAgentMode === 'specific' && (
                            <select className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                value={exportAgentId} onChange={e => setExportAgentId(e.target.value)}>
                                <option value="">Select Agent</option>
                                {agents.map((a: Agent) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button onClick={onClose} className="flex-1 py-3 font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={onExport}
                            disabled={isExporting || (exportAgentMode === 'specific' && !exportAgentId)}
                            className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Download size={16} />
                            {isExporting ? 'Exporting...' : 'Export Salary'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
