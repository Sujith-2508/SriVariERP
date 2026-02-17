'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, AlertCircle, IndianRupee, Package, Users, Calendar, DollarSign, TrendingDown, Clock, Percent, Wallet, Receipt } from 'lucide-react';
import { calculateInvoiceProfit, formatCurrency } from '@/lib/utils';
import { TransactionType, SupplierData, PurchaseBillData, AgentSalaryData } from '@/types';
import { getAllSuppliers, getPurchaseBills } from '@/lib/purchaseService';
import { getSalaryByMonth } from '@/lib/salaryService';
import { getExpensesByMonth } from '@/lib/expenseService';
import { CompanyExpense } from '@/types';

export default function Dashboard() {
    const { dealers, products, transactions, agents } = useData();
    const [suppliers, setSuppliers] = useState<SupplierData[]>([]);
    const [purchaseBills, setPurchaseBills] = useState<PurchaseBillData[]>([]);
    const [agentSalaries, setAgentSalaries] = useState<AgentSalaryData[]>([]);
    const [companyExpenses, setCompanyExpenses] = useState<CompanyExpense[]>([]);
    const [profitPeriod, setProfitPeriod] = useState<'monthly' | 'yearly'>('monthly');

    // Selected month and year for viewing historical data
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // 1-12
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Load expenses and salaries when month/year changes
    useEffect(() => {
        const loadDashboardData = async () => {
            const [suppliersData, billsData, salariesData, expensesData] = await Promise.all([
                getAllSuppliers(),
                getPurchaseBills(),
                getSalaryByMonth(selectedMonth, selectedYear),
                getExpensesByMonth(selectedMonth, selectedYear)
            ]);
            setSuppliers(suppliersData);
            setPurchaseBills(billsData);
            setAgentSalaries(salariesData);
            setCompanyExpenses(expensesData);
        };
        loadDashboardData();
    }, [selectedMonth, selectedYear]);

    // ========================================================================
    // 1. FUNDAMENTAL STATS
    // ========================================================================
    const { totalOutstanding, totalPayables, lowStockItems, todaysSales, monthlySales, totalPurchases } = useMemo(() => {
        const totalOutstanding = dealers.reduce((acc, d) => acc + d.balance, 0);
        const totalPayables = suppliers.reduce((acc, s) => acc + (s.balance || 0), 0);
        const lowStockItems = products.filter(p => p.stock < 50);

        const totalPurchases = purchaseBills.reduce((acc, b) => acc + b.amount, 0);

        const todayStr = new Date().toDateString();
        const todaysSales = transactions
            .filter(t => t.type === 'INVOICE' && new Date(t.date).toDateString() === todayStr)
            .reduce((acc, t) => acc + t.amount, 0);

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const monthlySales = transactions
            .filter(t => {
                const txnDate = new Date(t.date);
                return t.type === 'INVOICE' &&
                    txnDate.getMonth() === currentMonth &&
                    txnDate.getFullYear() === currentYear;
            })
            .reduce((acc, t) => acc + t.amount, 0);

        return { totalOutstanding, totalPayables, lowStockItems, todaysSales, monthlySales, totalPurchases };
    }, [dealers, products, transactions, suppliers, purchaseBills]);

    // Weekly Sales Chart Data
    const { chartData, weeklySalesTotal } = useMemo(() => {
        const today = new Date();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const result = [];

        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dayStart = new Date(date.setHours(0, 0, 0, 0));
            const dayEnd = new Date(date.setHours(23, 59, 59, 999));

            const daySales = transactions
                .filter(t => {
                    const txnDate = new Date(t.date);
                    return t.type === 'INVOICE' && txnDate >= dayStart && txnDate <= dayEnd;
                })
                .reduce((acc, t) => acc + t.amount, 0);

            result.push({
                name: dayNames[new Date(dayStart).getDay()],
                sales: daySales,
                date: dayStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
            });
        }
        const weeklySalesTotal = result.reduce((acc, d) => acc + d.sales, 0);
        return { chartData: result, weeklySalesTotal };
    }, [transactions]);

    // ========================================================================
    // 2. PROFIT ANALYSIS (UPDATED WITH MONTHLY/YEARLY SUPPORT)
    // ========================================================================
    // Helper to get financial year date range (April 1 - March 31)
    const getFinancialYearRange = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();

        // If current month is Jan-Mar, FY started last year
        // If current month is Apr-Dec, FY started this year
        const fyStartYear = month < 3 ? year - 1 : year;

        const startDate = new Date(fyStartYear, 3, 1); // April 1
        const endDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59); // March 31 next year

        return { startDate, endDate, fyStartYear };
    };

    const { totalRevenue, totalCOGS, totalDiscounts, totalAgentExpenses, totalCompanyExpenses, totalProfit, profitMargin, totalStockValue, periodLabel } = useMemo(() => {
        let startDate: Date;
        let endDate: Date;
        let label: string;

        if (profitPeriod === 'monthly') {
            // Monthly: use selected month and year
            startDate = new Date(selectedYear, selectedMonth - 1, 1);
            endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
            label = new Date(selectedYear, selectedMonth - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        } else {
            // Yearly: financial year based on selected month/year
            const referenceDate = new Date(selectedYear, selectedMonth - 1, 1);
            const fyRange = getFinancialYearRange(referenceDate);
            startDate = fyRange.startDate;
            endDate = fyRange.endDate;
            label = `FY ${fyRange.fyStartYear}-${String(fyRange.fyStartYear + 1).slice(2)}`;
        }

        const invoices = transactions.filter(t => {
            const txnDate = new Date(t.date);
            return t.type === TransactionType.INVOICE &&
                txnDate >= startDate &&
                txnDate <= endDate;
        });

        let revenue = 0;
        let cogs = 0;
        let discounts = 0;
        let profit = 0;

        invoices.forEach(invoice => {
            const p = calculateInvoiceProfit(invoice, products);
            revenue += p.revenue;
            cogs += p.cogs;
            discounts += p.dealerDiscount;
            profit += p.netProfit;
        });

        console.log(`[Dashboard] Period: ${label}`);
        console.log(`[Dashboard] Products loaded: ${products.length}`);
        console.log(`[Dashboard] Invoices in period: ${invoices.length}`);
        console.log(`[Dashboard] Total Revenue: ${revenue}, Total COGS: ${cogs}`);

        // Get expenses for the period
        let agentExpenses = 0;
        let compExpenses = 0;

        if (profitPeriod === 'monthly') {
            agentExpenses = agentSalaries.reduce((acc, s) => acc + (s.totalExpense || 0) + s.baseSalary, 0);
            compExpenses = companyExpenses.reduce((acc, e) => acc + e.amount, 0);
        } else {
            // For yearly, we need to fetch all months in the FY
            // Since we only have current month data, we'll use current month * 12 as estimate
            // In production, you'd fetch all months in the FY
            agentExpenses = agentSalaries.reduce((acc, s) => acc + (s.totalExpense || 0) + s.baseSalary, 0) * 12;
            compExpenses = companyExpenses.reduce((acc, e) => acc + e.amount, 0) * 12;
        }

        const netProfit = profit - agentExpenses - compExpenses;
        const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
        const inventoryValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.costPrice || 0)), 0);

        return {
            totalRevenue: revenue,
            totalCOGS: cogs,
            totalDiscounts: discounts,
            totalAgentExpenses: agentExpenses,
            totalCompanyExpenses: compExpenses,
            totalProfit: netProfit,
            profitMargin: margin,
            totalStockValue: inventoryValue,
            periodLabel: label
        };
    }, [transactions, products, agentSalaries, companyExpenses, profitPeriod, selectedMonth, selectedYear]);

    // ========================================================================
    // 3. OUTSTANDING ANALYSIS
    // ========================================================================
    const outstandingData = useMemo(() => {
        const day0to30 = 0;
        const day31to60 = 0;
        const day61to90 = 0;
        const overdue = 0;
        const counts = { day0to30, day31to60, day61to90, overdue };
        const now = new Date();
        const invoices = transactions.filter(t => t.type === TransactionType.INVOICE);

        dealers.forEach(dealer => {
            if (dealer.balance > 0) {
                const dealerInvoices = invoices
                    .filter(inv => inv.customerId === dealer.id)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                let remainingBalance = dealer.balance;

                for (const invoice of dealerInvoices) {
                    if (remainingBalance <= 0) break;

                    const amount = Math.min(remainingBalance, invoice.amount);
                    const invoiceDate = new Date(invoice.date);
                    const ageDays = Math.ceil((now.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));

                    if (ageDays <= 30) counts.day0to30 += amount;
                    else if (ageDays <= 60) counts.day31to60 += amount;
                    else if (ageDays <= 90) counts.day61to90 += amount;
                    else counts.overdue += amount;

                    remainingBalance -= amount;
                }

                if (remainingBalance > 0) {
                    counts.overdue += remainingBalance;
                }
            }
        });

        return [
            { name: '0-30 Days', value: counts.day0to30, color: '#10b981' },
            { name: '31-60 Days', value: counts.day31to60, color: '#f59e0b' },
            { name: '61-90 Days', value: counts.day61to90, color: '#f97316' },
            { name: '90+ Days', value: counts.overdue, color: '#ef4444' },
        ].filter(d => d.value > 0);
    }, [dealers, transactions]);

    // ========================================================================
    // 4. AGENT COLLECTION ANALYSIS
    // ========================================================================
    const { agentCollectionData, totalCollected, totalTarget, collectionPercentage, pieData } = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const data = agents.map(agent => {
            const collected = transactions
                .filter(t => {
                    const txnDate = new Date(t.date);
                    return t.type === 'PAYMENT' &&
                        t.agentName === agent.name &&
                        txnDate.getMonth() === currentMonth &&
                        txnDate.getFullYear() === currentYear;
                })
                .reduce((acc, t) => acc + t.amount, 0);

            const target = agent.collectionTarget || 100000;

            return {
                name: agent.name,
                collected: collected,
                target: target,
                percentage: target > 0 ? Math.round((collected / target) * 100) : 0
            };
        });

        const collected = data.reduce((acc, a) => acc + a.collected, 0);
        const target = data.reduce((acc, a) => acc + a.target, 0);
        const percentage = target > 0 ? Math.min(Math.round((collected / target) * 100), 100) : 0;

        const pie = [
            { name: 'Collected', value: collected },
            { name: 'Pending', value: Math.max(target - collected, 0) },
        ];

        return {
            agentCollectionData: data,
            totalCollected: collected,
            totalTarget: target,
            collectionPercentage: percentage,
            pieData: pie
        };
    }, [agents, transactions]);

    const COLORS = ['#10b981', '#e2e8f0'];


    // ========================================================================
    // COMPONENT RENDER
    // ========================================================================

    const StatCard = ({ title, value, icon: Icon, color, subtitle, trend }: {
        title: string;
        value: string;
        icon: React.ElementType;
        color: string;
        subtitle?: string;
        trend?: { value: string; positive: boolean };
    }) => (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm text-slate-500 font-medium mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
                    {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
                    {trend && (
                        <div className={`flex items-center gap-1 text-xs font-bold mt-2 ${trend.positive ? 'text-emerald-600' : 'text-red-600'}`}>
                            {trend.positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {trend.value}
                        </div>
                    )}
                </div>
                <div className={`p-3 rounded-lg ${color}`}>
                    <Icon size={24} className="text-white" />
                </div>
            </div>
        </div>
    );

    return (
        <div className="p-6 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Business Dashboard</h1>
                    <p className="text-sm text-slate-500">Overview for {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</p>


                </div>
                <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg">
                    <Calendar size={16} className="text-slate-500" />
                    <span className="text-sm font-medium text-slate-600">
                        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                </div>
            </div>

            {/* MAIN STATS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard
                    title="Total Revenue"
                    value={formatCurrency(totalRevenue)}
                    icon={IndianRupee}
                    color="bg-blue-500"
                    subtitle="Sales revenue"
                />
                <StatCard
                    title="Net Profit"
                    value={formatCurrency(totalProfit)}
                    icon={DollarSign}
                    color="bg-emerald-500"
                    subtitle={`Margin: ${profitMargin.toFixed(1)}%`}
                    trend={{ value: `${profitMargin.toFixed(1)}% Margin`, positive: profitMargin > 15 }}
                />
                <StatCard
                    title="Receivables"
                    value={formatCurrency(totalOutstanding)}
                    icon={Clock}
                    color="bg-red-500"
                    subtitle="Outstanding from dealers"
                />
                <StatCard
                    title="Payables"
                    value={formatCurrency(totalPayables)}
                    icon={Wallet}
                    color="bg-orange-500"
                    subtitle="Dues to suppliers"
                />
            </div>

            {/* PROFIT & OUTSTANDING DETAILS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* 1. Profit Breakdown */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Percent size={18} className="text-emerald-500" />
                            Profit Breakdown
                        </h3>
                        {/* Period Toggle */}
                        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setProfitPeriod('monthly')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${profitPeriod === 'monthly'
                                    ? 'bg-white text-emerald-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-800'
                                    }`}
                            >
                                Monthly
                            </button>
                            <button
                                onClick={() => setProfitPeriod('yearly')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${profitPeriod === 'yearly'
                                    ? 'bg-white text-emerald-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-800'
                                    }`}
                            >
                                Yearly
                            </button>
                        </div>
                    </div>

                    {/* Month and Year Selectors */}
                    <div className="mb-3 flex gap-2">
                        {/* Show month selector only in monthly view */}
                        {profitPeriod === 'monthly' && (
                            <div className="flex-1">
                                <label className="block text-xs text-slate-500 mb-1">Month</label>
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                >
                                    <option value={1}>January</option>
                                    <option value={2}>February</option>
                                    <option value={3}>March</option>
                                    <option value={4}>April</option>
                                    <option value={5}>May</option>
                                    <option value={6}>June</option>
                                    <option value={7}>July</option>
                                    <option value={8}>August</option>
                                    <option value={9}>September</option>
                                    <option value={10}>October</option>
                                    <option value={11}>November</option>
                                    <option value={12}>December</option>
                                </select>
                            </div>
                        )}
                        <div className={profitPeriod === 'monthly' ? 'flex-1' : 'w-full'}>
                            <label className="block text-xs text-slate-500 mb-1">Year</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                            >
                                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Period Label */}
                    <div className="mb-3 text-xs text-slate-500 font-medium">
                        Period: {periodLabel}
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                            <span className="text-sm text-slate-600">Total Revenue</span>
                            <span className="font-bold text-slate-800">{formatCurrency(totalRevenue)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-100">
                            <span className="text-sm text-red-600">Cost of Goods (COGS)</span>
                            <span className="font-bold text-red-700">-{formatCurrency(totalCOGS)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-100">
                            <span className="text-sm text-orange-600">Discounts Given</span>
                            <span className="font-bold text-orange-700">-{formatCurrency(totalDiscounts)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg border border-purple-100">
                            <span className="text-sm text-purple-600">Agent Expenses</span>
                            <span className="font-bold text-purple-700">-{formatCurrency(totalAgentExpenses)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <span className="text-sm text-blue-600">Company Expenses</span>
                            <span className="font-bold text-blue-700">-{formatCurrency(totalCompanyExpenses)}</span>
                        </div>
                        <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                            <span className="font-bold text-slate-800">Net {profitPeriod === 'monthly' ? 'Monthly' : 'Yearly'} Profit</span>
                            <span className="font-bold text-emerald-600 text-lg">{formatCurrency(totalProfit)}</span>
                        </div>
                    </div>
                </div>

                {/* 2. Outstanding Aging */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 col-span-1 lg:col-span-2">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Clock size={18} className="text-red-500" />
                        Outstanding Balance Aging
                    </h3>
                    <div className="flex gap-6 h-64">

                        {/* Aging Chart */}
                        <div className="flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={outstandingData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        formatter={(value: number) => [formatCurrency(value), 'Amount']}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                                        {outstandingData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Aging Stats */}
                        <div className="w-48 flex flex-col justify-center space-y-4">
                            {outstandingData.map((item, idx) => (
                                <div key={idx}>
                                    <p className="text-xs text-slate-500">{item.name}</p>
                                    <p className="font-bold text-slate-800" style={{ color: item.color }}>
                                        {formatCurrency(item.value)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* FINANCIAL OVERVIEW (NEW) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Payables Column */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Wallet size={18} className="text-orange-500" />
                        Supplier Payables (Credits to Pay)
                    </h3>
                    <div className="space-y-3 overflow-y-auto max-h-64 pr-2 custom-scrollbar">
                        {suppliers.filter(s => (s.balance || 0) > 0).length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">No outstanding payables.</p>
                        ) : (
                            suppliers
                                .filter(s => (s.balance || 0) > 0)
                                .sort((a, b) => (b.balance || 0) - (a.balance || 0))
                                .slice(0, 10)
                                .map((supplier, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-slate-700">{supplier.name}</span>
                                            <span className="text-xs text-slate-400">{supplier.phone}</span>
                                        </div>
                                        <span className="font-bold text-red-600">{formatCurrency(supplier.balance || 0)}</span>
                                    </div>
                                ))
                        )}
                    </div>
                </div>

                {/* Receivables Column */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <IndianRupee size={18} className="text-emerald-500" />
                        Dealer Receivables (Outstanding)
                    </h3>
                    <div className="space-y-3 overflow-y-auto max-h-64 pr-2 custom-scrollbar">
                        {dealers.filter(d => d.balance > 0).length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">No outstanding receivables.</p>
                        ) : (
                            dealers
                                .filter(d => d.balance > 0)
                                .sort((a, b) => b.balance - a.balance)
                                .slice(0, 10)
                                .map((dealer, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-slate-700">{dealer.businessName}</span>
                                            <span className="text-xs text-slate-400">{dealer.city}</span>
                                        </div>
                                        <span className="font-bold text-emerald-600">{formatCurrency(dealer.balance)}</span>
                                    </div>
                                ))
                        )}
                    </div>
                </div>
            </div>

            {/* CHARTS ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Weekly Sales Performance Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <TrendingUp size={18} className="text-blue-500" />
                        Weekly Sales Trend
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `₹${(v / 1000)}k`} />
                                <Tooltip
                                    cursor={{ fill: '#f1f5f9' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Sales']}
                                />
                                <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Agent Collection Analysis */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Users size={18} className="text-emerald-500" />
                        Collection Targets
                    </h3>
                    <div className="flex gap-6">
                        {/* Pie Chart */}
                        <div className="relative w-32 h-32 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={35}
                                        outerRadius={50}
                                        dataKey="value"
                                        strokeWidth={0}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index]} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-lg font-bold text-slate-800">{collectionPercentage}%</span>
                            </div>
                        </div>

                        {/* Agent List */}
                        <div className="flex-1 space-y-3 overflow-y-auto max-h-48 pr-2 custom-scrollbar">
                            {agentCollectionData.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">No agents yet.</p>
                            ) : (
                                agentCollectionData.map((agent, idx) => {
                                    const isOverTarget = agent.percentage >= 100;
                                    const displayPercent = Math.min(agent.percentage, 100);
                                    return (
                                        <div key={idx} className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-600">
                                                {agent.name.split(' ').map(n => n[0]).join('')}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="font-medium text-slate-700">{agent.name}</span>
                                                    <span className={isOverTarget ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                                                        {agent.percentage}%
                                                    </span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${isOverTarget ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                                        style={{ width: `${displayPercent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f1f5f9;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 2px;
                }
            `}</style>
        </div>
    );
}
