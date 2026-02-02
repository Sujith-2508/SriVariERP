'use client';

import React from 'react';
import { useData } from '@/contexts/DataContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, AlertCircle, IndianRupee, Package, Users, Calendar } from 'lucide-react';

export default function Dashboard() {
    const { dealers, products, transactions, agents } = useData();

    // Stats Calculations
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

    // Weekly Sales Chart Data - Real data from last 7 days
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

    // Agent Collection Analysis Data - Real data from database
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

        // Use actual target from agent data
        const target = agent.collectionTarget || 100000;

        return {
            name: agent.name,
            collected: collected,
            target: target,
            percentage: target > 0 ? Math.round((collected / target) * 100) : 0
        };
    });

    // Collection Performance for Pie Chart
    const totalCollected = agentCollectionData.reduce((acc, a) => acc + a.collected, 0);
    const totalTarget = agentCollectionData.reduce((acc, a) => acc + a.target, 0);
    const collectionPercentage = totalTarget > 0 ? Math.min(Math.round((totalCollected / totalTarget) * 100), 100) : 0;

    const pieData = [
        { name: 'Collected', value: totalCollected },
        { name: 'Pending', value: Math.max(totalTarget - totalCollected, 0) },
    ];
    const COLORS = ['#10b981', '#e2e8f0'];

    const StatCard = ({ title, value, icon: Icon, color, subtitle }: {
        title: string;
        value: string;
        icon: React.ElementType;
        color: string;
        subtitle?: string;
    }) => (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm text-slate-500 font-medium mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
                    {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
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
                    <h1 className="text-2xl font-bold text-slate-800">Admin Dashboard</h1>
                    <p className="text-sm text-slate-500">Welcome back! Here's your business overview.</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg">
                    <Calendar size={16} className="text-slate-500" />
                    <span className="text-sm font-medium text-slate-600">
                        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard
                    title="Weekly Sales"
                    value={`₹${weeklySalesTotal.toLocaleString()}`}
                    icon={TrendingUp}
                    color="bg-emerald-500"
                    subtitle="Last 7 days"
                />
                <StatCard
                    title="Total Outstanding"
                    value={`₹${totalOutstanding.toLocaleString()}`}
                    icon={IndianRupee}
                    color="bg-red-500"
                    subtitle={`${dealers.filter(d => d.balance > 0).length} dealers`}
                />
                <StatCard
                    title="Monthly Sales"
                    value={`₹${monthlySales.toLocaleString()}`}
                    icon={Calendar}
                    color="bg-blue-500"
                    subtitle={new Date().toLocaleString('en-IN', { month: 'long' })}
                />
                <StatCard
                    title="Low Stock Alerts"
                    value={lowStockItems.length.toString()}
                    icon={AlertCircle}
                    color="bg-orange-400"
                    subtitle="Items need restock"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Weekly Sales Performance Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <TrendingUp size={18} className="text-emerald-500" />
                        Weekly Sales Performance
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
                                <Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Agent Collection Analysis */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Users size={18} className="text-blue-500" />
                        Agent Collection Analysis
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
                        <div className="flex-1 space-y-3">
                            {agentCollectionData.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">No agents yet. Add agents to track collections.</p>
                            ) : (
                                agentCollectionData.map((agent, idx) => {
                                    const isOverTarget = agent.percentage >= 100;
                                    const displayPercent = Math.min(agent.percentage, 100);
                                    return (
                                        <div key={idx} className="flex items-center gap-3" title={`₹${agent.collected.toLocaleString()} / ₹${agent.target.toLocaleString()}`}>
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

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Low Stock Alerts */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Package size={18} className="text-orange-500" />
                        Low Stock Alerts
                    </h3>
                    {lowStockItems.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <Package size={32} className="mx-auto mb-2 opacity-50" />
                            <p>All items are well stocked!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {lowStockItems.slice(0, 5).map(item => (
                                <div key={item.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-100">
                                    <div>
                                        <p className="font-medium text-slate-800">{item.name}</p>
                                        <p className="text-xs text-slate-500 font-mono">{item.productId}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.stock === 0
                                            ? 'bg-red-100 text-red-700'
                                            : 'bg-orange-100 text-orange-700'
                                            }`}>
                                            {item.stock === 0 ? 'Out of Stock' : `${item.stock} left`}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Transactions */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <IndianRupee size={18} className="text-emerald-500" />
                        Recent Transactions
                    </h3>
                    <div className="space-y-3">
                        {transactions.slice(0, 5).map(txn => (
                            <div key={txn.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${txn.type === 'INVOICE' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                                    <div>
                                        <p className="font-medium text-slate-800">{txn.referenceId}</p>
                                        <p className="text-xs text-slate-500">{new Date(txn.date).toLocaleDateString('en-IN')}</p>
                                    </div>
                                </div>
                                <span className={`font-bold ${txn.type === 'INVOICE' ? 'text-blue-600' : 'text-emerald-600'}`}>
                                    {txn.type === 'INVOICE' ? '+' : '-'} ₹{txn.amount.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
