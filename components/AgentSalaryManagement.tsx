'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Agent, AgentSalaryData } from '@/types';
import {
    createSalaryRecord,
    updateSalaryRecord,
    markSalaryPaid,
    getSalaryByMonth
} from '@/lib/salaryService';
import { Calendar, DollarSign, Plus, Edit2, Check, X, Search } from 'lucide-react';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';

interface AgentSalaryManagementProps {
    agents: Agent[];
}

export default function AgentSalaryManagement({ agents }: AgentSalaryManagementProps) {
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [salaries, setSalaries] = useState<AgentSalaryData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSalary, setEditingSalary] = useState<AgentSalaryData | null>(null);

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
        useRef<any>(null), // Agent Selection
        useRef<HTMLInputElement>(null), // Base Salary
        useRef<HTMLInputElement>(null), // Travel Expense
        useRef<HTMLInputElement>(null), // Stay Expense
        useRef<HTMLInputElement>(null), // Food Expense
        useRef<HTMLInputElement>(null), // Other Expense
        useRef<HTMLTextAreaElement>(null), // Notes
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
                <button
                    onClick={() => {
                        resetForm();
                        setIsModalOpen(true);
                    }}
                    className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg"
                >
                    <Plus size={16} />
                    Add Salary
                </button>
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
                        {[2024, 2025, 2026, 2027].map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Salaries Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-slate-500">Loading...</div>
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
                                            <td className="p-4 font-medium text-slate-800">{agent?.name}</td>
                                            <td className="p-4 text-right">₹{salary.baseSalary.toLocaleString()}</td>
                                            <td className="p-4 text-right text-orange-600">₹{salary.travelExpense.toLocaleString()}</td>
                                            <td className="p-4 text-right text-orange-600">₹{salary.stayExpense.toLocaleString()}</td>
                                            <td className="p-4 text-right text-orange-600">₹{salary.foodExpense.toLocaleString()}</td>
                                            <td className="p-4 text-right text-orange-600">₹{salary.otherExpense.toLocaleString()}</td>
                                            <td className="p-4 text-right font-bold text-emerald-600">₹{salary.netSalary.toLocaleString()}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${salary.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                    {salary.paymentStatus}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => openEdit(salary)}
                                                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    {salary.paymentStatus === 'PENDING' && (
                                                        <button
                                                            onClick={() => handleMarkPaid(salary.id)}
                                                            className="p-2 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg"
                                                            title="Mark as Paid"
                                                        >
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
                                            No salary records for {monthNames[selectedMonth - 1]} {selectedYear}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
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
                                    <input
                                        ref={formRefs[1]}
                                        onKeyDown={handleKeyDown}
                                        type="number"
                                        required
                                        min="0"
                                        step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={salaryForm.baseSalary}
                                        onChange={e => setSalaryForm({ ...salaryForm, baseSalary: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Travel Expense</label>
                                    <input
                                        ref={formRefs[2]}
                                        onKeyDown={handleKeyDown}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={salaryForm.travelExpense}
                                        onChange={e => setSalaryForm({ ...salaryForm, travelExpense: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Stay Expense</label>
                                    <input
                                        ref={formRefs[3]}
                                        onKeyDown={handleKeyDown}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={salaryForm.stayExpense}
                                        onChange={e => setSalaryForm({ ...salaryForm, stayExpense: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Food Expense</label>
                                    <input
                                        ref={formRefs[4]}
                                        onKeyDown={handleKeyDown}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={salaryForm.foodExpense}
                                        onChange={e => setSalaryForm({ ...salaryForm, foodExpense: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Other Expense</label>
                                <input
                                    ref={formRefs[5]}
                                    onKeyDown={handleKeyDown}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={salaryForm.otherExpense}
                                    onChange={e => setSalaryForm({ ...salaryForm, otherExpense: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                <textarea
                                    ref={formRefs[6]}
                                    onKeyDown={handleKeyDown}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    rows={2}
                                    value={salaryForm.notes}
                                    onChange={e => setSalaryForm({ ...salaryForm, notes: e.target.value })}
                                />
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
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg border border-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg"
                                >
                                    {editingSalary ? 'Save Changes' : 'Add Salary'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
