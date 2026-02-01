'use client';

import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Search, MapPin, Phone, Check, CheckCircle, Share2, Wallet, ArrowRight, FileText, User } from 'lucide-react';
import { Dealer } from '@/types';

export default function Collections() {
    const { dealers, transactions, agents, recordPayment } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeDealer, setActiveDealer] = useState<Dealer | null>(null);
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('Cash');
    const [selectedAgent, setSelectedAgent] = useState(agents[0]?.name || 'Admin');
    const [isProcessing, setIsProcessing] = useState(false);

    // Success State
    const [successData, setSuccessData] = useState<{
        dealerName: string;
        amountPaid: number;
        newBalance: number;
        receiptId: string;
        agentName: string;
    } | null>(null);

    // Filter dealers with outstanding balance > 0
    const filteredDealers = dealers
        .filter(d => d.balance > 0)
        .filter(d =>
            d.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.district.toLowerCase().includes(searchTerm.toLowerCase())
        );

    const handleSubmitPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeDealer || !amount) return;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            alert("Please enter a valid amount");
            return;
        }

        setIsProcessing(true);
        await new Promise(r => setTimeout(r, 1000));

        const receiptId = await recordPayment(activeDealer.id, amountNum, method, selectedAgent);

        setSuccessData({
            dealerName: activeDealer.businessName,
            amountPaid: amountNum,
            newBalance: activeDealer.balance - amountNum,
            receiptId: receiptId,
            agentName: selectedAgent
        });

        setIsProcessing(false);
        setActiveDealer(null);
        setAmount('');
    };

    const handleCloseSuccess = () => {
        setSuccessData(null);
    };

    // Success / Receipt View
    if (successData) {
        return (
            <div className="flex items-center justify-center h-full p-6 animate-in fade-in zoom-in duration-500">
                <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full border border-emerald-100">
                    {/* Animated Success Icon */}
                    <div className="relative mx-auto w-20 h-20 mb-6">
                        <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-50"></div>
                        <div className="relative w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
                            <CheckCircle className="text-white" size={40} />
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Receipt Generated!</h2>
                    <p className="text-slate-600 mb-4">
                        Payment received from <strong>{successData.dealerName}</strong>
                    </p>

                    <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200 text-left space-y-2">
                        <div className="flex justify-between">
                            <span className="text-slate-500 text-sm">Receipt No</span>
                            <span className="font-mono font-bold text-emerald-700">{successData.receiptId}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500 text-sm">Amount Received</span>
                            <span className="font-bold text-emerald-600">₹{successData.amountPaid.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500 text-sm">Collected By</span>
                            <span className="font-medium text-slate-700">{successData.agentName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500 text-sm">Collection Date</span>
                            <span className="font-medium text-slate-700">
                                {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-slate-200">
                            <span className="text-slate-500 text-sm">Updated Balance</span>
                            <span className="font-bold text-slate-700">₹{successData.newBalance.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="bg-emerald-50 rounded-lg p-3 mb-6 border border-emerald-100">
                        <div className="flex items-center justify-center gap-2 text-emerald-700 text-sm">
                            <CheckCircle size={16} />
                            <span className="font-medium">Receipt sent via WhatsApp</span>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            className="flex-1 bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                        >
                            <Share2 size={18} />
                            Share
                        </button>
                        <button
                            onClick={handleCloseSuccess}
                            className="flex-[2] bg-slate-900 text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Payment Form View with FIFO Statement
    if (activeDealer) {
        // Calculate FIFO statement for selected dealer
        const txns = transactions
            .filter(t => t.customerId === activeDealer.id)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const invoices: {
            id: string;
            date: Date;
            referenceId: string;
            amount: number;
            paid: number;
            balance: number;
            daysPending: number;
            creditDays: number;
            dueDate: Date | null;
            isOverdue: boolean;
        }[] = [];

        const payments: { date: Date; amount: number; remaining: number }[] = [];

        // First pass: collect all invoices and payments
        txns.forEach(txn => {
            if (txn.type === 'INVOICE') {
                const due = txn.dueDate ? new Date(txn.dueDate) : null;
                const isOverdue = due ? new Date() > due : false;
                invoices.push({
                    id: txn.id,
                    date: new Date(txn.date),
                    referenceId: txn.referenceId || 'N/A',
                    amount: txn.amount,
                    paid: 0,
                    balance: txn.amount,
                    daysPending: Math.ceil((new Date().getTime() - new Date(txn.date).getTime()) / (1000 * 60 * 60 * 24)),
                    creditDays: txn.creditDays || 30,
                    dueDate: due,
                    isOverdue: isOverdue
                });
            } else {
                payments.push({
                    date: new Date(txn.date),
                    amount: txn.amount,
                    remaining: txn.amount
                });
            }
        });

        // Second pass: Apply FIFO logic
        payments.forEach(payment => {
            let remainingPayment = payment.remaining;
            for (const invoice of invoices) {
                if (remainingPayment <= 0) break;
                if (invoice.balance <= 0) continue;

                const paymentForThisInvoice = Math.min(remainingPayment, invoice.balance);
                invoice.paid += paymentForThisInvoice;
                invoice.balance -= paymentForThisInvoice;
                remainingPayment -= paymentForThisInvoice;
            }
        });

        // Filter to show only unpaid/partially paid invoices
        const pendingInvoices = invoices.filter(inv => inv.balance > 0);

        return (
            <div className="h-full overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto">
                    <button
                        onClick={() => setActiveDealer(null)}
                        className="mb-4 text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    >
                        ← Back to list
                    </button>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* FIFO Statement */}
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-800 text-white p-4">
                                <div className="flex items-center gap-2">
                                    <FileText size={18} />
                                    <h3 className="font-bold">Statement - FIFO</h3>
                                </div>
                                <p className="text-slate-400 text-sm mt-1">{activeDealer.businessName}</p>
                                <p className="text-slate-500 text-xs mt-0.5">
                                    {activeDealer.city && `${activeDealer.city}, `}{activeDealer.district}
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="text-left p-3 font-semibold text-slate-600">Date</th>
                                            <th className="text-left p-3 font-semibold text-slate-600">Invoice No</th>
                                            <th className="text-right p-3 font-semibold text-slate-600">Amount</th>
                                            <th className="text-right p-3 font-semibold text-slate-600">Paid</th>
                                            <th className="text-right p-3 font-semibold text-slate-600">Balance</th>
                                            <th className="text-center p-3 font-semibold text-slate-600">Due Date</th>
                                            <th className="text-center p-3 font-semibold text-slate-600">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingInvoices.map((inv, idx) => (
                                            <tr key={inv.id} className={`
                                                ${inv.isOverdue ? 'bg-red-50 border-l-4 border-l-red-500' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                                            `}>
                                                <td className="p-3">
                                                    {inv.date.toLocaleDateString('en-IN', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric'
                                                    })}
                                                </td>
                                                <td className={`p-3 font-mono text-xs font-bold ${inv.isOverdue ? 'text-red-700' : ''}`}>
                                                    {inv.referenceId}
                                                </td>
                                                <td className="p-3 text-right">₹{inv.amount.toLocaleString()}</td>
                                                <td className="p-3 text-right text-emerald-600">₹{inv.paid.toLocaleString()}</td>
                                                <td className="p-3 text-right font-bold text-red-600">₹{inv.balance.toLocaleString()}</td>
                                                <td className={`p-3 text-center text-sm ${inv.isOverdue ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                                                    {inv.dueDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) || 'N/A'}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {inv.isOverdue ? (
                                                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">
                                                            ⚠️ OVERDUE
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-bold">
                                                            {inv.daysPending}d old
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {pendingInvoices.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="p-6 text-center text-slate-400">
                                                    No pending invoices
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                                        <tr>
                                            <td colSpan={4} className="p-3 font-bold text-right">Total Outstanding:</td>
                                            <td className="p-3 text-right font-bold text-red-600 text-lg">
                                                ₹{pendingInvoices.reduce((acc, inv) => acc + inv.balance, 0).toLocaleString()}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            <div className="p-3 bg-amber-50 border-t border-amber-200 text-xs text-amber-700">
                                <strong>FIFO:</strong> Payments are applied to oldest invoices first
                            </div>
                        </div>

                        {/* Payment Form */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
                            <div className="bg-emerald-600 text-white p-4">
                                <h3 className="font-bold">Record Payment</h3>
                                <p className="text-emerald-100 text-sm mt-1">Outstanding: ₹{activeDealer.balance.toLocaleString()}</p>
                            </div>
                            <form onSubmit={handleSubmitPayment} className="p-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            className="w-full pl-8 pr-4 py-3 rounded-lg border-2 border-slate-200 focus:border-emerald-500 focus:ring-0 outline-none text-lg font-bold text-slate-800"
                                            placeholder="0"
                                            value={amount}
                                            onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Mode</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['Cash', 'Cheque', 'UPI'].map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setMethod(m)}
                                                className={`py-2 rounded-lg border-2 font-bold text-xs transition-all ${method === m
                                                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                    }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                        <User size={14} />
                                        Collected By
                                    </label>
                                    <select
                                        className="w-full p-2.5 border-2 border-slate-200 rounded-lg focus:border-emerald-500 outline-none bg-white font-medium"
                                        value={selectedAgent}
                                        onChange={e => setSelectedAgent(e.target.value)}
                                    >
                                        <option value="Admin">Admin</option>
                                        {agents.map(agent => (
                                            <option key={agent.id} value={agent.name}>{agent.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isProcessing || !amount}
                                    className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-emerald-700 disabled:bg-slate-300 disabled:shadow-none flex items-center justify-center gap-2 transition-all"
                                >
                                    {isProcessing ? (
                                        <span className="flex items-center gap-2">
                                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Processing...
                                        </span>
                                    ) : (
                                        <>
                                            <Check size={18} />
                                            Confirm Payment
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Dealer List View
    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Collections</h1>
                    <p className="text-sm text-slate-500">Record payments from dealers with outstanding balances</p>
                </div>
                <div className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded-lg text-sm font-bold border border-emerald-200 flex items-center gap-2">
                    <Wallet size={16} />
                    {filteredDealers.length} Pending
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md mb-6">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                    type="text"
                    placeholder="Search Dealer..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Dealer Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDealers.map(dealer => (
                    <div
                        key={dealer.id}
                        className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                        onClick={() => setActiveDealer(dealer)}
                    >
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                        <div className="flex justify-between items-start mb-3 pl-2">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">{dealer.businessName}</h3>
                                <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                                    <MapPin size={12} />
                                    {dealer.city && `${dealer.city}, `}{dealer.district}
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider">Due</span>
                                <span className="font-bold text-red-600 text-lg">₹{dealer.balance.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 pl-2">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Phone size={10} />
                                {dealer.phone}
                            </span>
                            <button className="text-emerald-700 font-bold text-xs bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-emerald-100 transition-colors">
                                Collect <ArrowRight size={12} />
                            </button>
                        </div>
                    </div>
                ))}
                {filteredDealers.length === 0 && (
                    <div className="col-span-full text-center py-16 text-slate-400">
                        <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={24} className="text-slate-300" />
                        </div>
                        <p className="font-medium">No pending collections found</p>
                        <p className="text-sm">All dealers are up to date!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
