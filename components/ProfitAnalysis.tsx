'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { calculateInvoiceProfit, formatCurrency } from '@/lib/utils';
import { TransactionType, AgentSalaryData, CompanyExpense } from '@/types';
import { getSalaryByRange } from '@/lib/salaryService';
import { getExpensesByRange } from '@/lib/expenseService';
import { generateProfitAnalysisPDF } from '@/lib/pdfGenerator';
import { TrendingUp, TrendingDown, Calendar, ArrowLeft, ArrowRight, DollarSign, Percent, Package, Users, Download, X, FileText, Clock, Search, RefreshCw } from 'lucide-react';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function ProfitAnalysis() {
    const { transactions, products, dealers, companySettings } = useData();
    const [period, setPeriod] = useState<Period>('monthly');
    const [date, setDate] = useState(new Date());

    // State for period-specific expenses/salaries
    const [agentSalaries, setAgentSalaries] = useState<AgentSalaryData[]>([]);
    const [companyExpenses, setCompanyExpenses] = useState<CompanyExpense[]>([]);

    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [dateRangeModal, setDateRangeModal] = useState({
        open: false,
        range: 'monthly' as 'all' | 'fy-pick' | 'month-pick' | 'custom',
        selectedFY: new Date().getFullYear().toString(),
        selectedMonth: new Date().toISOString().slice(0, 7),
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10)
    });

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
            const diff = start.getDate() - day + (day === 0 ? -6 : 1);
            start.setDate(diff);
            start.setHours(0, 0, 0, 0);
            end.setTime(start.getTime() + (7 * 24 * 60 * 60 * 1000) - 1);
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
            end.setFullYear(start.getFullYear() + 1);
            end.setMonth(0, 0);
            end.setHours(23, 59, 59, 999);
            lbl = start.toLocaleDateString('en-IN', { year: 'numeric' });
        }

        return { startDate: start, endDate: end, label: lbl };
    }, [period, date]);

    useEffect(() => {
        const loadExpenses = async () => {
            // For Daily/Weekly, we still need the monthly context for fixed cost allocation
            // but we'll fetch the range specifically for variable costs
            const fetchStart = new Date(startDate);
            const fetchEnd = new Date(endDate);

            // Fetch salaries (usually monthly) and expenses in range
            const [salaries, expenses] = await Promise.all([
                getSalaryByRange(fetchStart, fetchEnd),
                getExpensesByRange(fetchStart, fetchEnd)
            ]);

            setAgentSalaries(salaries);
            setCompanyExpenses(expenses);
        };
        loadExpenses();
    }, [startDate.getTime(), endDate.getTime()]);


    // 2. Filter Transactions
    const filteredInvoices = useMemo(() => {
        return transactions.filter(t => {
            if (t.type !== TransactionType.INVOICE) return false;
            const tDate = new Date(t.date);
            return tDate.getTime() >= startDate.getTime() && tDate.getTime() <= endDate.getTime();
        });
    }, [transactions, startDate, endDate]);

    // 3. Calculate metrics
    const { revenue, cogs, discounts, grossProfit, profit, margin, expensesDetails, invoiceCount } = useMemo(() => {
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
        // 1. Sum up all salaries in the range
        const totalSalaries = agentSalaries.reduce((acc, s) => acc + (s.totalExpense || 0) + s.baseSalary, 0);
        
        // 2. Sum up all company expenses in the range
        const totalCompExpenses = companyExpenses.reduce((acc, e) => acc + e.amount, 0);

        // Allocation logic:
        // If the range doesn't have any salaries/expenses recorded (common for daily/weekly),
        // we might still want to estimate fixed costs.
        // But with getSalaryByRange/getExpensesByRange, if they are recorded for the month,
        // and our range spans that month, we get them.
        
        let allocatedExpenses = totalSalaries + totalCompExpenses;

        const netProfit = p - allocatedExpenses;
        const m = rev > 0 ? (netProfit / rev) * 100 : 0;

        return {
            revenue: rev,
            cogs: c,
            discounts: d,
            grossProfit: gp,
            profit: netProfit,
            margin: m,
            expensesDetails: allocatedExpenses,
            invoiceCount: filteredInvoices.length
        };
    }, [filteredInvoices, products, agentSalaries, companyExpenses]);

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

    // Export handler
    const handleExportPDF = async () => {
        setIsGeneratingPdf(true);
        try {
            let start = new Date();
            let end = new Date();
            let periodLbl = '';

            if (dateRangeModal.range === 'all') {
                const dates = transactions.map(t => new Date(t.date).getTime());
                start = dates.length > 0 ? new Date(Math.min(...dates)) : new Date();
                end = new Date();
                periodLbl = 'Complete Historical Statement';
            } else if (dateRangeModal.range === 'fy-pick') {
                const year = parseInt(dateRangeModal.selectedFY);
                start = new Date(year, 3, 1); // April 1st
                end = new Date(year + 1, 2, 31, 23, 59, 59, 999); // March 31st
                periodLbl = `FY ${year}-${String(year + 1).slice(-2)}`;
            } else if (dateRangeModal.range === 'month-pick') {
                const [y, m] = dateRangeModal.selectedMonth.split('-').map(Number);
                start = new Date(y, m - 1, 1);
                end = new Date(y, m, 0, 23, 59, 59, 999);
                periodLbl = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            } else {
                start = new Date(dateRangeModal.startDate);
                end = new Date(dateRangeModal.endDate);
                end.setHours(23, 59, 59, 999);
                periodLbl = `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
            }

            // Calculations for the selected range
            const rangeInvoices = transactions.filter(t => {
                if (t.type !== TransactionType.INVOICE) return false;
                const tDate = new Date(t.date);
                return tDate.getTime() >= start.getTime() && tDate.getTime() <= end.getTime();
            });

            const [rangeSalaries, rangeExpenses] = await Promise.all([
                getSalaryByRange(start, end),
                getExpensesByRange(start, end)
            ]);

            let rRevenue = 0, rCogs = 0, rDiscounts = 0, rGp = 0, rNp = 0;
            const dealerStats: any = {};

            rangeInvoices.forEach(inv => {
                const calc = calculateInvoiceProfit(inv, products);
                rRevenue += calc.revenue;
                rCogs += calc.cogs;
                rDiscounts += calc.dealerDiscount;
                rGp += calc.grossProfit;
                rNp += calc.netProfit;

                const dealer = dealers.find((d: any) => d.id === inv.customerId);
                const dName = dealer?.businessName || 'Unknown Dealer';
                if (!dealerStats[inv.customerId]) {
                    dealerStats[inv.customerId] = { name: dName, revenue: 0, cogs: 0, grossProfit: 0, count: 0 };
                }
                dealerStats[inv.customerId].revenue += calc.revenue;
                dealerStats[inv.customerId].cogs += calc.cogs;
                dealerStats[inv.customerId].grossProfit += calc.grossProfit;
                dealerStats[inv.customerId].count += 1;
            });

            const totalSalaries = rangeSalaries.reduce((acc, s) => acc + s.baseSalary + (s.totalExpense || 0), 0);
            const totalCompExpenses = rangeExpenses.reduce((acc, e) => acc + e.amount, 0);
            const rangeNetProfit = rNp - (totalSalaries + totalCompExpenses);
            const rangeMargin = rRevenue > 0 ? (rangeNetProfit / rRevenue) * 100 : 0;

            generateProfitAnalysisPDF(companySettings, {
                periodLabel: periodLbl,
                revenue: rRevenue,
                cogs: rCogs,
                discounts: rDiscounts,
                grossProfit: rGp,
                netProfit: rangeNetProfit,
                margin: rangeMargin,
                agentSalariesTotal: totalSalaries,
                companyExpensesTotal: totalCompExpenses,
                invoiceCount: rangeInvoices.length,
                dealerBreakdown: Object.values(dealerStats) as any[],
            });

            setDateRangeModal(prev => ({ ...prev, open: false }));
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Profit Analysis</h2>
                    <p className="text-sm text-slate-500">Detailed breakdown of revenue, costs, and margins</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Export PDF */}
                    <button
                        onClick={() => setDateRangeModal(prev => ({ ...prev, open: true }))}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100"
                    >
                        <Download size={15} />
                        Export Statements
                    </button>

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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Waterfall / Breakdown List */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-full">
                    <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
                        <Percent size={18} className="text-blue-500" />
                        Financial Breakdown
                    </h3>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                            <span className="font-medium text-slate-600">Total Sales Revenue</span>
                            <span className="font-bold text-slate-800">{formatCurrency(revenue)}</span>
                        </div>

                        <div className="relative pl-4 space-y-3">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-100 rounded-full"></div>

                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-medium">(-) Product Cost (COGS)</span>
                                <span className="text-red-500 font-bold">{formatCurrency(cogs)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-medium">(-) Discounts Given</span>
                                <span className="text-orange-500 font-bold">{formatCurrency(discounts)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-medium">(-) Operating Expenses</span>
                                <span className="text-purple-500 font-bold">{formatCurrency(expensesDetails)}</span>
                            </div>
                        </div>

                        <div className="pt-4 mt-2 border-t border-slate-100">
                            <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                <span className="font-bold text-emerald-800">Company Net Profit</span>
                                <span className={`font-bold text-2xl ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(profit)}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-2 text-center uppercase tracking-widest font-bold">Generated based on {filteredInvoices.length} invoices</p>
                        </div>
                    </div>
                </div>

                {/* Profitability Highlights */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
                        <TrendingUp size={18} className="text-emerald-500" />
                        Profitability Insights
                    </h3>

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Gross Margin</p>
                                <p className="text-xl font-black text-slate-700">{revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : 0}%</p>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Net Margin</p>
                                <p className="text-xl font-black text-slate-700">{margin.toFixed(1)}%</p>
                            </div>
                        </div>

                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-2">
                                <Package size={14} />
                                COGS Efficiency
                            </p>
                            <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                                    style={{ width: `${revenue > 0 ? Math.min(100, (cogs / revenue) * 100) : 0}%` }}
                                ></div>
                            </div>
                            <p className="text-[10px] text-blue-600 font-medium">
                                Product costs consume {revenue > 0 ? ((cogs / revenue) * 100).toFixed(1) : 0}% of your total revenue.
                            </p>
                        </div>

                        {cogs === 0 && revenue > 0 && (
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex gap-3 items-start">
                                <TrendingDown size={20} className="text-red-500 shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-red-700 mb-1">Missing Cost Data</p>
                                    <p className="text-[10px] text-red-600 leading-relaxed">
                                        Some products in your invoices don't have a <strong>Cost Price</strong> set.
                                        Please update your Inventory to see accurate profit numbers.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Dealer-wise Breakdown Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
                <div className="p-6 border-b border-slate-200">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Users size={18} className="text-emerald-500" />
                        Dealer-wise Profitability Breakdown
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="p-4">Dealer Name</th>
                                <th className="p-4 text-center">Inv Count</th>
                                <th className="p-4 text-right">Revenue</th>
                                <th className="p-4 text-right">COGS</th>
                                <th className="p-4 text-right">Gross Profit</th>
                                <th className="p-4 text-right">Margin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(() => {
                                // Group by dealer
                                const dealerStats = filteredInvoices.reduce((acc: any, inv) => {
                                    const dealer = dealers.find((d: any) => d.id === inv.customerId);
                                    const dealerName = dealer?.businessName || 'Unknown Dealer';
                                    const dealerId = inv.customerId;

                                    if (!acc[dealerId]) {
                                        acc[dealerId] = {
                                            name: dealerName,
                                            revenue: 0,
                                            cogs: 0,
                                            count: 0,
                                            profit: 0
                                        };
                                    }

                                    const calc = calculateInvoiceProfit(inv, products);
                                    acc[dealerId].revenue += calc.revenue;
                                    acc[dealerId].cogs += calc.cogs;
                                    acc[dealerId].profit += calc.grossProfit;
                                    acc[dealerId].count += 1;

                                    return acc;
                                }, {});

                                const sortedDealers = Object.values(dealerStats).sort((a: any, b: any) => b.revenue - a.revenue);

                                if (sortedDealers.length === 0) {
                                    return (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-slate-400 italic">No dealer data available for this period</td>
                                        </tr>
                                    );
                                }

                                return sortedDealers.map((d: any, idx) => {
                                    const marginPercent = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-bold text-slate-700">{d.name}</td>
                                            <td className="p-4 text-center text-slate-500">{d.count}</td>
                                            <td className="p-4 text-right font-medium">{formatCurrency(d.revenue)}</td>
                                            <td className="p-4 text-right text-red-500 font-medium">-{formatCurrency(d.cogs)}</td>
                                            <td className="p-4 text-right text-emerald-600 font-bold">{formatCurrency(d.profit)}</td>
                                            <td className="p-4 text-right">
                                                <span className={`px-2 py-1 rounded text-[10px] font-black ${marginPercent > 20 ? 'bg-emerald-100 text-emerald-700' :
                                                    marginPercent > 10 ? 'bg-blue-100 text-blue-700' :
                                                        'bg-slate-100 text-slate-700'
                                                    }`}>
                                                    {marginPercent.toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── Profit analysis Export Modal ───────────────────────── */}
            {dateRangeModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setDateRangeModal(prev => ({ ...prev, open: false }))}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}>
                        
                        {/* Header */}
                        <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center">
                                    <Download size={18} className="text-white" />
                                </div>
                                <div>
                                    <p className="font-bold text-white text-base">Profit Analysis Export</p>
                                    <p className="text-slate-400 text-xs">Select range for profitability report</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setDateRangeModal(prev => ({ ...prev, open: false }))}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* 4 Option Cards */}
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'all', icon: <FileText size={22} />, label: 'Complete', sub: 'Entire history' },
                                    { id: 'fy-pick', icon: <Calendar size={22} />, label: 'Financial Year', sub: 'Apr–Mar range' },
                                    { id: 'month-pick', icon: <Clock size={22} />, label: 'By Month', sub: 'Specific month' },
                                    { id: 'custom', icon: <Search size={22} />, label: 'Custom Range', sub: 'Pick from–to dates' },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setDateRangeModal(prev => ({ ...prev, range: opt.id as any }))}
                                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center ${
                                            dateRangeModal.range === opt.id
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
                                        }`}
                                    >
                                        <span className={dateRangeModal.range === opt.id ? 'text-emerald-600' : 'text-slate-400'}>{opt.icon}</span>
                                        <span className="font-semibold text-sm leading-tight">{opt.label}</span>
                                        <span className="text-xs text-slate-400">{opt.sub}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Dynamic Sub-fields */}
                            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                {dateRangeModal.range === 'fy-pick' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Select Financial Year</label>
                                        <select
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-sm"
                                            value={dateRangeModal.selectedFY}
                                            onChange={(e) => setDateRangeModal(prev => ({ ...prev, selectedFY: e.target.value }))}
                                        >
                                            {(() => {
                                                const currentYear = new Date().getFullYear();
                                                const startYear = 2022;
                                                const yearsList = Array.from({ length: (currentYear + 15) - startYear + 1 }, (_, i) => startYear + i).reverse();
                                                return yearsList.map(y => (
                                                    <option key={y} value={y.toString()}>FY {y}-{String(y + 1).slice(-2)}</option>
                                                ));
                                            })()}
                                        </select>
                                    </div>
                                )}

                                {dateRangeModal.range === 'month-pick' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Select Month</label>
                                        <input
                                            type="month"
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                            value={dateRangeModal.selectedMonth}
                                            onChange={(e) => setDateRangeModal(prev => ({ ...prev, selectedMonth: e.target.value }))}
                                        />
                                    </div>
                                )}

                                {dateRangeModal.range === 'custom' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Start Date</label>
                                            <input
                                                type="date"
                                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                                value={dateRangeModal.startDate}
                                                onChange={(e) => setDateRangeModal(prev => ({ ...prev, startDate: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">End Date</label>
                                            <input
                                                type="date"
                                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                                                value={dateRangeModal.endDate}
                                                onChange={(e) => setDateRangeModal(prev => ({ ...prev, endDate: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                )}

                                {dateRangeModal.range === 'all' && (
                                    <div className="text-center py-2">
                                        <p className="text-sm font-medium text-slate-600">Generating complete historical statement</p>
                                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-bold">Includes all records from the beginning</p>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setDateRangeModal(prev => ({ ...prev, open: false }))}
                                    className="flex-1 py-3 font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleExportPDF}
                                    disabled={isGeneratingPdf}
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isGeneratingPdf ? (
                                        <><RefreshCw size={18} className="animate-spin" /> Working...</>
                                    ) : (
                                        <><Download size={18} /> Export PDF</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

