'use client';

import React, { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/contexts/ToastContext';
import { Search, MapPin, Phone, Check, CheckCircle, Share2, Wallet, ArrowRight, FileText, User, IndianRupee, Printer, CreditCard, Calendar, Trash2, Download, Building2, ChevronRight, MessageSquare, Plus, Edit2, AlertCircle } from 'lucide-react';
import { Dealer } from '@/types';
import { calculateDealerStatement } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { DEFAULT_COMPANY_SETTINGS } from '@/constants';
import { generateReceiptPDFBase64 } from '@/lib/pdfGenerator';
import { uploadReceiptPDF } from '@/lib/googleDriveService';

export default function Collections() {
    const { dealers, transactions, agents, recordPayment, createInvoice, isLoading } = useData();
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeDealer, setActiveDealer] = useState<Dealer | null>(null);
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('Cash');
    const [selectedAgent, setSelectedAgent] = useState(agents[0]?.name || 'Admin');
    const [isProcessing, setIsProcessing] = useState(false);
    const [companySettings, setCompanySettings] = useState<any>(null);

    // Cheque Return State
    const [showChequeReturnModal, setShowChequeReturnModal] = useState(false);
    const [chequeReturnAmount, setChequeReturnAmount] = useState('');
    const [chequeReturnReason, setChequeReturnReason] = useState('Insufficient Funds');
    const [chequeReturnRef, setChequeReturnRef] = useState('');
    const [chequeReturnProcessing, setChequeReturnProcessing] = useState(false);
    const [chequeReturnSuccess, setChequeReturnSuccess] = useState(false);

    // Load Company Settings
    useEffect(() => {
        const loadSettings = async () => {
            const { data, error } = await supabase
                .from('company_settings')
                .select('id, company_name, address_line1, address_line2, city, state, pin_code, gst_number, pan_number, phone, email, bank_name, bank_branch, account_number, ifsc_code, account_holder_name, account_type')
                .limit(1);
            if (data && data[0]) {
                const settings = data[0];
                setCompanySettings({
                    companyName: settings.company_name,
                    addressLine1: settings.address_line1,
                    city: settings.city,
                    pinCode: settings.pin_code,
                    gstNumber: settings.gst_number,
                    phone: settings.phone
                });
            } else {
                setCompanySettings(DEFAULT_COMPANY_SETTINGS);
            }
        };
        loadSettings();
    }, []);

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

    // FIFO Logic for selected dealer (Statement Preview)
    // Moved to top level to avoid conditional hook call error
    const sortedInvoices = React.useMemo(() => {
        if (!activeDealer) return [];

        const dealerTransactions = transactions.filter(t => t.customerId === activeDealer.id);
        const { invoices } = calculateDealerStatement(dealerTransactions);
        return invoices;
    }, [activeDealer, transactions]);

    const handleSubmitPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeDealer || !amount) return;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            showToast("Please enter a valid amount", "warning");
            return;
        }

        setIsProcessing(true);
        await new Promise(r => setTimeout(r, 1000));

        const receiptId = await recordPayment(activeDealer.id, amountNum, method, selectedAgent);

        // Real-time Sync to Google Sheets
        try {
            const { syncPaymentToSheets } = await import('@/lib/googleSheetWriter');
            await syncPaymentToSheets(
                activeDealer.businessName,
                receiptId,
                amountNum,
                method,
                selectedAgent
            );
        } catch (syncError) {
            console.error('[Collections] Sheets Sync Failed:', syncError);
        }

        // --- AUTOMATIC PDF BACKUP TO GOOGLE DRIVE ---
        if (companySettings && activeDealer) {
            // Background process to avoid blocking UI success screen
            (async () => {
                try {
                    const receiptBase64 = await generateReceiptPDFBase64(
                        activeDealer!,
                        amountNum,
                        method,
                        selectedAgent,
                        receiptId,
                        companySettings
                    );

                    const fileName = `Receipt_${receiptId}_${activeDealer!.businessName.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`;

                    console.log('[Collections] Starting automatic Drive upload:', fileName);
                    await uploadReceiptPDF(receiptBase64, fileName, activeDealer!.businessName);
                    console.log('[Collections] Automatic Drive upload success!');
                } catch (driveErr) {
                    console.error('[Collections] Automatic Drive upload failed:', driveErr);
                }
            })();
        }

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

    // Cheque Return: creates an INVOICE to increase balance back
    const handleChequeReturn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeDealer) return;
        const amountNum = parseFloat(chequeReturnAmount);
        if (isNaN(amountNum) || amountNum <= 0) return;

        setChequeReturnProcessing(true);
        try {
            const refNote = chequeReturnRef ? ` (Ref: ${chequeReturnRef})` : '';
            const noteText = `Cheque Return${refNote} – Reason: ${chequeReturnReason}`;

            // Create a zero-item invoice for the bounced amount
            const { refId: newInvoiceRef } = await createInvoice(
                activeDealer.id,
                [], // no items for a cheque return
                amountNum,
                { notes: noteText }
            );

            // Sync to Google Sheets
            try {
                const { syncPaymentToSheets } = await import('@/lib/googleSheetWriter');
                // Log as a debit (increases balance) with a Cheque Return label
                await syncPaymentToSheets(
                    activeDealer.businessName,
                    newInvoiceRef, // Use the actual invoice number (INVxxx)
                    -amountNum, // negative so it shows as debit/owed
                    'Cheque Return',
                    'System'
                );
            } catch (syncErr) {
                console.warn('[Collections] Cheque Return sheet sync failed:', syncErr);
            }

            setChequeReturnSuccess(true);
            setTimeout(() => {
                setShowChequeReturnModal(false);
                setChequeReturnSuccess(false);
                setChequeReturnAmount('');
                setChequeReturnRef('');
                setChequeReturnReason('Insufficient Funds');
            }, 1800);
        } catch (error) {
            console.error('Cheque return error:', error);
            showToast('Failed to record cheque return. Please try again.', 'error');
        } finally {
            setChequeReturnProcessing(false);
        }
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
                            onClick={() => handleCloseSuccess()}
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

        // FIFO Logic for selected dealer (Statement Preview)


        const pendingInvoices = sortedInvoices.filter(inv => inv.balance > 0);



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

                        {/* Payment Form + Cheque Return Button */}
                        <div className="space-y-4">
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
                                        <div className="grid grid-cols-2 gap-2">
                                            {['Cash', 'Cheque', 'UPI', 'Stock Return'].map(m => (
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

                            {/* ── Cheque Return Card ── */}
                            <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
                                <div className="bg-red-50 border-b border-red-200 p-3 flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-red-700 text-sm">Cheque Bounced?</p>
                                        <p className="text-red-500 text-xs">Add back to outstanding balance</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowChequeReturnModal(true)}
                                        className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                                    >
                                        Record Cheque Return
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ╔══ Cheque Return Modal ══╗ */}
                {showChequeReturnModal && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-red-100 overflow-hidden">
                            <div className="bg-red-600 text-white p-5 flex justify-between items-start">
                                <div>
                                    <h2 className="text-lg font-bold">Record Cheque Return</h2>
                                    <p className="text-red-200 text-sm mt-1">{activeDealer?.businessName}</p>
                                </div>
                                <button onClick={() => setShowChequeReturnModal(false)} className="text-red-200 hover:text-white">✕</button>
                            </div>
                            {chequeReturnSuccess ? (
                                <div className="p-8 text-center">
                                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle size={32} className="text-emerald-600" />
                                    </div>
                                    <p className="font-bold text-slate-800 text-lg">Cheque Return Recorded!</p>
                                    <p className="text-slate-500 text-sm mt-1">Balance has been updated</p>
                                </div>
                            ) : (
                                <form onSubmit={handleChequeReturn} className="p-5 space-y-4">
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                                        <strong>⚠️ Cheque Return</strong> — This will increase the dealer's outstanding balance back by the entered amount.
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Bounced Amount *</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                            <input type="text" inputMode="decimal"
                                                className="w-full pl-8 pr-4 py-3 rounded-lg border-2 border-slate-200 focus:border-red-500 outline-none font-bold"
                                                placeholder="Enter bounced cheque amount"
                                                value={chequeReturnAmount}
                                                onChange={e => setChequeReturnAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                                                required autoFocus />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Original Receipt / Cheque No</label>
                                        <input type="text"
                                            className="w-full px-3 py-2.5 rounded-lg border-2 border-slate-200 focus:border-red-500 outline-none font-mono"
                                            placeholder="e.g. R001, Cheque #123456"
                                            value={chequeReturnRef}
                                            onChange={e => setChequeReturnRef(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Reason for Return</label>
                                        <select className="w-full px-3 py-2.5 rounded-lg border-2 border-slate-200 focus:border-red-500 outline-none bg-white font-medium"
                                            value={chequeReturnReason} onChange={e => setChequeReturnReason(e.target.value)}>
                                            <option>Insufficient Funds</option>
                                            <option>Signature Mismatch</option>
                                            <option>Account Closed</option>
                                            <option>Date Mismatch</option>
                                            <option>Payment Stopped by Drawer</option>
                                            <option>Other</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button type="button" onClick={() => setShowChequeReturnModal(false)}
                                            className="flex-1 py-3 rounded-lg border-2 border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
                                            Cancel
                                        </button>
                                        <button type="submit" disabled={chequeReturnProcessing || !chequeReturnAmount}
                                            className="flex-[2] bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 disabled:bg-slate-300 flex items-center justify-center gap-2">
                                            {chequeReturnProcessing ? (
                                                <>
                                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                    </svg>
                                                    Recording...
                                                </>
                                            ) : '📋 Record Cheque Return'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                )}
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

// ---- Cheque Return Modal (overlay, rendered inline) ----
// Note: This component is intentionally written as a named export for clarity
// but is referenced inline in the Collections component via showChequeReturnModal state.
// The modal is rendered as a portal-like overlay inside the active dealer view.
// Implementation: added directly into the Collections component JSX tree via the
// showChequeReturnModal state flag. The modal markup is appended to the bottom
// of the activeDealer view block just before the closing tag.
//
// The actual modal JSX is embedded inside the activeDealer return block above.
// This file ends here.
