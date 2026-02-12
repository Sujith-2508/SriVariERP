'use client';

import React from 'react';
import { useData } from '@/contexts/DataContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, AlertCircle, IndianRupee, Package, Users, Calendar, DollarSign, TrendingDown, Clock, Percent } from 'lucide-react';
import { calculateInvoiceProfit, formatCurrency } from '@/lib/utils';
import { TransactionType } from '@/types';

export default function Dashboard() {
    const { dealers, products, transactions, agents } = useData();

    // ========================================================================
    // 1. FUNDAMENTAL STATS
    // ========================================================================
    const totalOutstanding = dealers.reduce((acc, d) => acc + d.balance, 0);
    const lowStockItems = products.filter(p => p.stock < 50);

    // Today's Sales
    const todaysSales = transactions
        .filter(t => t.type === 'INVOICE' && new Date(t.date).toDateString() === new Date().toDateString())
        .reduce((acc, t) => acc + t.amount, 0);

    // Monthly Sales (current month)
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlySales = transactions
        .filter(t => {
            const txnDate = new Date(t.date);
            return t.type === 'INVOICE' &&
                txnDate.getMonth() === currentMonth &&
                txnDate.getFullYear() === currentYear;
        })
        .reduce((acc, t) => acc + t.amount, 0);

    // Weekly Sales Chart Data
    const getWeeklySalesData = () => {
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
        return result;
    };

    const chartData = getWeeklySalesData();
    const weeklySalesTotal = chartData.reduce((acc, d) => acc + d.sales, 0);

    // ========================================================================
    // 2. PROFIT ANALYSIS (NEW)
    // ========================================================================
    const invoices = transactions.filter(t => t.type === TransactionType.INVOICE);
    let totalRevenue = 0;
    let totalCOGS = 0;
    // let totalServiceCharges = 0;
    let totalDiscounts = 0;
    let totalProfit = 0;

    invoices.forEach(invoice => {
        const profit = calculateInvoiceProfit(invoice, products);
        totalRevenue += profit.revenue;
        totalCOGS += profit.cogs;
        // totalServiceCharges += profit.serviceCharges;
        totalDiscounts += profit.dealerDiscount;
        totalProfit += profit.netProfit;
    });

    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // ========================================================================
    // 3. OUTSTANDING ANALYSIS (NEW)
    // ========================================================================
    const today = new Date();
    const outstandingByAge = {
        days0to30: 0,
        days31to60: 0,
        days61to90: 0,
        overdue: 0
    };

    dealers.forEach(dealer => {
        if (dealer.balance > 0) {
            // Find unpaid invoices for this dealer
            const dealerInvoices = invoices
                .filter(inv => inv.customerId === dealer.id)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // Simple aging logic: Assume oldest balance is from oldest invoice (FIFO)
            // Ideally we should track balance per invoice, but for dashboard summary:
            let remainingBalance = dealer.balance;

            // Iterate invoices from newest to oldest to categorizing current balance? 
            // NO, standard aging is usually FIFO - oldest debt remains.
            // But usually we apply payments to oldest. So remaining balance belongs to NEWEST invoices.
            // Correct approach: Remaining balance is attributed to the MOST RECENT invoices.

            for (const invoice of dealerInvoices) {
                if (remainingBalance <= 0) break;

                const amount = Math.min(remainingBalance, invoice.amount);
                const invoiceDate = new Date(invoice.date);
                const ageDays = Math.ceil((today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));

                if (ageDays <= 30) outstandingByAge.days0to30 += amount;
                else if (ageDays <= 60) outstandingByAge.days31to60 += amount;
                else if (ageDays <= 90) outstandingByAge.days61to90 += amount;
                else outstandingByAge.overdue += amount;

                remainingBalance -= amount;
            }

            // If there's still balance left (e.g. opening balance not linked to invoices), put in overdue
            if (remainingBalance > 0) {
                outstandingByAge.overdue += remainingBalance;
            }
        }
    });

    const outstandingData = [
        { name: '0-30 Days', value: outstandingByAge.days0to30, color: '#10b981' },
        { name: '31-60 Days', value: outstandingByAge.days31to60, color: '#f59e0b' },
        { name: '61-90 Days', value: outstandingByAge.days61to90, color: '#f97316' },
        { name: '90+ Days', value: outstandingByAge.overdue, color: '#ef4444' },
    ].filter(d => d.value > 0);

    // ========================================================================
    // 4. AGENT COLLECTION ANALYSIS
    // ========================================================================
    const agentCollectionData = agents.map(agent => {
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

    const totalCollected = agentCollectionData.reduce((acc, a) => acc + a.collected, 0);
    const totalTarget = agentCollectionData.reduce((acc, a) => acc + a.target, 0);
    const collectionPercentage = totalTarget > 0 ? Math.min(Math.round((totalCollected / totalTarget) * 100), 100) : 0;

    const pieData = [
        { name: 'Collected', value: totalCollected },
        { name: 'Pending', value: Math.max(totalTarget - totalCollected, 0) },
    ];
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
                    subtitle="All time revenue"
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
                    title="Outstanding"
                    value={formatCurrency(totalOutstanding)}
                    icon={Clock}
                    color="bg-red-500"
                    subtitle={`${dealers.filter(d => d.balance > 0).length} dealers pending`}
                />
                <StatCard
                    title="Low Stock"
                    value={lowStockItems.length.toString()}
                    icon={AlertCircle}
                    color="bg-orange-400"
                    subtitle="Items below threshold"
                />
            </div>

            {/* PROFIT & OUTSTANDING DETAILS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* 1. Profit Breakdown */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Percent size={18} className="text-emerald-500" />
                        Profit Breakdown
                    </h3>
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
                        <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                            <span className="font-bold text-slate-800">Net Profit</span>
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
