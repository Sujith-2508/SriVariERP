'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { calculateInvoiceProfit, formatCurrency } from '@/lib/utils';
import { TransactionType, AgentSalaryData, CompanyExpense } from '@/types';
import { getSalaryByMonth } from '@/lib/salaryService';
import { getExpensesByMonth } from '@/lib/expenseService';
import { TrendingUp, TrendingDown, Calendar, ArrowLeft, ArrowRight, DollarSign, Percent } from 'lucide-react';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function ProfitAnalysis() {
    const { transactions, products } = useData();
    const [period, setPeriod] = useState<Period>('monthly');
    const [date, setDate] = useState(new Date());

    // State for monthly expenses/salaries
    const [agentSalaries, setAgentSalaries] = useState<AgentSalaryData[]>([]);
    const [companyExpenses, setCompanyExpenses] = useState<CompanyExpense[]>([]);

    useEffect(() => {
        const loadExpenses = async () => {
            const month = date.getMonth() + 1;
            const year = date.getFullYear();

            const [salaries, expenses] = await Promise.all([
                getSalaryByMonth(month, year),
                getExpensesByMonth(month, year)
            ]);

            setAgentSalaries(salaries);
            setCompanyExpenses(expenses);
        };
        loadExpenses();
    }, [date.getMonth(), date.getFullYear()]);


    // --- DATA CALCULATION ---

    // 1. Determine Date Range based on Period
    const { startDate, endDate, label } = useMemo(() => {
        const start = new Date(date);
        const end = new Date(date);
        let lbl = '';

        if (period === 'daily') {
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            lbl = start.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } else if (period === 'weekly') {
            const day = start.getDay();
            const diff = start.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
            start.setDate(diff);
            start.setHours(0, 0, 0, 0);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
            lbl = `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        } else if (period === 'monthly') {
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            end.setMonth(start.getMonth() + 1);
            end.setDate(0);
            end.setHours(23, 59, 59, 999);
            lbl = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        } else if (period === 'yearly') {
            start.setMonth(0, 1);
            start.setHours(0, 0, 0, 0);
            end.setMonth(11, 31);
            end.setHours(23, 59, 59, 999);
            lbl = start.toLocaleDateString('en-IN', { year: 'numeric' });
        }

        return { startDate: start, endDate: end, label: lbl };
    }, [period, date]);

    // 2. Filter Transactions
    const filteredInvoices = useMemo(() => {
        return transactions.filter(t => {
            if (t.type !== TransactionType.INVOICE) return false;
            const tDate = new Date(t.date);
            // Use getTime() for safer comparison to avoid object reference issues
            return tDate.getTime() >= startDate.getTime() && tDate.getTime() <= endDate.getTime();
        });
    }, [transactions, startDate, endDate]);

    // 3. Calculate metrics
    const { revenue, cogs, discounts, grossProfit, profit, margin, expensesDetails } = useMemo(() => {
        let rev = 0;
        let c = 0;
        let d = 0;
        let gp = 0;
        let p = 0;

        filteredInvoices.forEach(inv => {
            const calc = calculateInvoiceProfit(inv, products);
            rev += calc.revenue;
            c += calc.cogs;
            d += calc.dealerDiscount;
            gp += calc.grossProfit;
            p += calc.netProfit;
        });

        // Expenses handling
        let allocatedExpenses = 0;
        const totalMonthlyExpenses =
            agentSalaries.reduce((acc, s) => acc + (s.totalExpense || 0) + s.baseSalary, 0) +
            companyExpenses.reduce((acc, e) => acc + e.amount, 0);

        if (period === 'monthly') {
            allocatedExpenses = totalMonthlyExpenses;
        } else if (period === 'yearly') {
            allocatedExpenses = totalMonthlyExpenses * 12; // Estimate
        } else if (period === 'weekly') {
            allocatedExpenses = (totalMonthlyExpenses / 30) * 7;
        } else if (period === 'daily') {
            allocatedExpenses = totalMonthlyExpenses / 30;
        }

        const netProfit = p - allocatedExpenses;
        const m = rev > 0 ? (netProfit / rev) * 100 : 0;

        return {
            revenue: rev,
            cogs: c,
            discounts: d,
            grossProfit: gp,
            profit: netProfit,
            margin: m,
            expensesDetails: allocatedExpenses
        };
    }, [filteredInvoices, products, agentSalaries, companyExpenses, period]);

    // Handlers
    const handlePrev = () => {
        const newDate = new Date(date);
        if (period === 'daily') newDate.setDate(date.getDate() - 1);
        if (period === 'weekly') newDate.setDate(date.getDate() - 7);
        if (period === 'monthly') newDate.setMonth(date.getMonth() - 1);
        if (period === 'yearly') newDate.setFullYear(date.getFullYear() - 1);
        setDate(newDate);
    };

    const handleNext = () => {
        const newDate = new Date(date);
        if (period === 'daily') newDate.setDate(date.getDate() + 1);
        if (period === 'weekly') newDate.setDate(date.getDate() + 7);
        if (period === 'monthly') newDate.setMonth(date.getMonth() + 1);
        if (period === 'yearly') newDate.setFullYear(date.getFullYear() + 1);
        setDate(newDate);
    };

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Profit Analysis</h2>
                    <p className="text-sm text-slate-500">Detailed breakdown of revenue, costs, and margins</p>
                </div>

                {/* Period Selectors */}
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    {(['daily', 'weekly', 'monthly', 'yearly'] as Period[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${period === p ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Date Navigation */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center">
                <button onClick={handlePrev} className="p-2 hover:bg-slate-50 rounded-full text-slate-500 hover:text-slate-800 transition-colors"><ArrowLeft size={20} /></button>
                <div className="text-center">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-center">
                        <Calendar size={18} className="text-emerald-500" />
                        {label}
                    </h2>
                </div>
                <button onClick={handleNext} className="p-2 hover:bg-slate-50 rounded-full text-slate-500 hover:text-slate-800 transition-colors"><ArrowRight size={20} /></button>
            </div>

            {/* Main Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <DollarSign size={18} className="text-blue-600" />
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Revenue</p>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(revenue)}</h3>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-red-50 rounded-lg">
                            <TrendingDown size={18} className="text-red-600" />
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cost of Goods</p>
                    </div>
                    <h3 className="text-2xl font-bold text-red-600">-{formatCurrency(cogs)}</h3>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-50 rounded-lg">
                            <Percent size={18} className="text-purple-600" />
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Profit</p>
                    </div>
                    <h3 className="text-2xl font-bold text-emerald-600">{formatCurrency(grossProfit)}</h3>
                    <p className="text-xs text-slate-400 mt-1">Before Expenses</p>
                </div>
                <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 ${profit >= 0 ? 'border-b-4 border-b-emerald-500' : 'border-b-4 border-b-red-500'}`}>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg ${profit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                            <TrendingUp size={18} className={profit >= 0 ? 'text-emerald-600' : 'text-red-600'} />
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Profit</p>
                    </div>
                    <h3 className={`text-2xl font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(profit)}</h3>
                    <p className="text-xs text-slate-400 mt-1">{margin.toFixed(1)}% Margin</p>
                </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Waterfall / Breakdown List */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
                        <Percent size={18} className="text-blue-500" />
                        Financial Breakdown
                    </h3>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                            <span className="font-medium text-slate-600">Total Sales Revenue</span>
                            <span className="font-bold text-slate-800">{formatCurrency(revenue)}</span>
                        </div>

                        <div className="relative pl-4 space-y-2">
                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-200"></div>

                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">(-) Product Cost (COGS)</span>
                                <span className="text-red-600 font-medium">{formatCurrency(cogs)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">(-) Discounts Given</span>
                                <span className="text-orange-600 font-medium">{formatCurrency(discounts)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">(-) Expenses (Est.)</span>
                                <span className="text-purple-600 font-medium">{formatCurrency(expensesDetails)}</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-lg text-slate-800">Net Profit</span>
                                <span className={`font-bold text-xl ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(profit)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Placeholder for Charts */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-slate-400 min-h-[300px]">
                    <TrendingUp size={48} className="mb-4 opacity-20" />
                    <p className="font-medium">Visual Charts</p>
                    <p className="text-sm">Revenue vs Expenses trend visualizations coming soon.</p>
                </div>
            </div>
        </div>
    );
}
