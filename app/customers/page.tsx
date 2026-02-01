'use client';

import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Phone, MapPin, Search, FileText, ArrowRight, X, Download, Calendar, IndianRupee, Clock, Trash2, Building2, MapPinned, AlertTriangle, ChevronLeft, Receipt, User } from 'lucide-react';
import { Transaction, PaymentAllocation } from '@/types';

export default function DealerLedger() {
    const { dealers, transactions, deleteDealer, getInvoicePaymentHistory } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDealerId, setSelectedDealerId] = useState<string | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<Transaction | null>(null);

    const filteredDealers = dealers.filter(d =>
        d.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.district.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedDealer = dealers.find(d => d.id === selectedDealerId);

    // Check if invoice is overdue
    const isOverdue = (dueDate?: Date): boolean => {
        if (!dueDate) return false;
        return new Date() > new Date(dueDate);
    };

    // Calculate days overdue
    const getDaysOverdue = (dueDate?: Date): number => {
        if (!dueDate) return 0;
        const today = new Date();
        const due = new Date(dueDate);
        const diffTime = today.getTime() - due.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
    };

    // Get transactions for selected dealer and calculate FIFO payments
    const getDealerStatement = (dealerId: string) => {
        const txns = transactions
            .filter(t => t.customerId === dealerId)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const invoices: {
            id: string;
            date: Date;
            referenceId: string;
            amount: number;
            paid: number;
            balance: number;
            daysToPay: number | null;
            paidDate: Date | null;
            creditDays: number;
            dueDate: Date | null;
            isOverdue: boolean;
            daysOverdue: number;
            transaction: Transaction;
        }[] = [];

        const payments: { date: Date; amount: number; remaining: number; agentName?: string; receiptId?: string }[] = [];

        // First pass: collect all invoices and payments
        txns.forEach(txn => {
            if (txn.type === 'INVOICE') {
                const due = txn.dueDate ? new Date(txn.dueDate) : null;
                invoices.push({
                    id: txn.id,
                    date: new Date(txn.date),
                    referenceId: txn.referenceId || 'N/A',
                    amount: txn.amount,
                    paid: 0,
                    balance: txn.amount,
                    daysToPay: null,
                    paidDate: null,
                    creditDays: txn.creditDays || 30,
                    dueDate: due,
                    isOverdue: isOverdue(txn.dueDate),
                    daysOverdue: getDaysOverdue(txn.dueDate),
                    transaction: txn
                });
            } else {
                payments.push({
                    date: new Date(txn.date),
                    amount: txn.amount,
                    remaining: txn.amount,
                    agentName: txn.agentName,
                    receiptId: txn.referenceId
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

                if (invoice.balance === 0 && invoice.paidDate === null) {
                    invoice.paidDate = payment.date;
                    invoice.daysToPay = Math.ceil((payment.date.getTime() - invoice.date.getTime()) / (1000 * 60 * 60 * 24));
                    invoice.isOverdue = false; // Paid, so not overdue anymore
                }
            }
        });

        return { invoices, payments };
    };

    // Invoice Detail View - shows payment history for specific invoice
    if (selectedInvoice && selectedDealer) {
        const paymentHistory = getInvoicePaymentHistory(selectedInvoice.id);
        const { invoices } = getDealerStatement(selectedDealer.id);
        const invoiceData = invoices.find(inv => inv.id === selectedInvoice.id);

        const overdue = invoiceData?.isOverdue && invoiceData.balance > 0;
        const daysOverdue = invoiceData?.daysOverdue || 0;

        return (
            <div className="h-full overflow-y-auto bg-slate-50">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 p-6 sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSelectedInvoice(null)}
                            className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold text-slate-800">Invoice {selectedInvoice.referenceId}</h1>
                                {overdue && (
                                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center gap-1 animate-pulse">
                                        <AlertTriangle size={12} />
                                        OVERDUE
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-500">{selectedDealer.businessName}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 max-w-4xl mx-auto">
                    {/* Overdue Alert */}
                    {overdue && (
                        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6 flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center shrink-0">
                                <AlertTriangle size={24} className="text-white" />
                            </div>
                            <div>
                                <h4 className="font-bold text-red-800">Payment Overdue by {daysOverdue} Days</h4>
                                <p className="text-sm text-red-600">
                                    This invoice was due on {invoiceData?.dueDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
                                    Please follow up with the dealer for collection.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Invoice Details Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                        <div className="bg-slate-800 text-white p-4">
                            <div className="flex items-center gap-2">
                                <FileText size={18} />
                                <h3 className="font-bold">Invoice Details</h3>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-1">Invoice Date</p>
                                    <p className="font-bold text-slate-800">
                                        {new Date(selectedInvoice.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-1">Invoice Amount</p>
                                    <p className="font-bold text-slate-800 text-lg">₹{selectedInvoice.amount.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-1">Credit Days</p>
                                    <p className="font-bold text-slate-800">{selectedInvoice.creditDays || 30} days</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-1">Due Date</p>
                                    <p className={`font-bold ${overdue ? 'text-red-600' : 'text-slate-800'}`}>
                                        {selectedInvoice.dueDate
                                            ? new Date(selectedInvoice.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                            : 'N/A'
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Payment Status Bar */}
                            <div className="mt-6 pt-6 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-slate-600">Payment Progress</span>
                                    <span className="text-sm font-bold text-slate-800">
                                        ₹{invoiceData?.paid.toLocaleString()} / ₹{selectedInvoice.amount.toLocaleString()}
                                    </span>
                                </div>
                                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${invoiceData?.balance === 0 ? 'bg-emerald-500' : overdue ? 'bg-red-500' : 'bg-blue-500'}`}
                                        style={{ width: `${((invoiceData?.paid || 0) / selectedInvoice.amount) * 100}%` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-2">
                                    <span className="text-xs text-emerald-600 font-medium">Paid: ₹{invoiceData?.paid.toLocaleString()}</span>
                                    <span className={`text-xs font-medium ${invoiceData?.balance === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {invoiceData?.balance === 0 ? 'Fully Paid ✓' : `Balance: ₹${invoiceData?.balance.toLocaleString()}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Payment History Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="bg-emerald-600 text-white p-4">
                            <div className="flex items-center gap-2">
                                <Receipt size={18} />
                                <h3 className="font-bold">Payment History</h3>
                            </div>
                            <p className="text-emerald-100 text-sm mt-1">Receipts applied to this invoice (FIFO)</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left p-4 font-semibold text-slate-600">Receipt No</th>
                                        <th className="text-left p-4 font-semibold text-slate-600">Date</th>
                                        <th className="text-right p-4 font-semibold text-slate-600">Amount Applied</th>
                                        <th className="text-left p-4 font-semibold text-slate-600">Collected By</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paymentHistory.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400">
                                                <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                                                No payments recorded for this invoice yet
                                            </td>
                                        </tr>
                                    ) : (
                                        paymentHistory.map((payment, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-4">
                                                    <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                                        {payment.receiptRef}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-slate-700">
                                                    {new Date(payment.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="p-4 text-right font-bold text-emerald-600">
                                                    ₹{payment.amount.toLocaleString()}
                                                </td>
                                                <td className="p-4 text-slate-600 flex items-center gap-2">
                                                    <User size={14} className="text-slate-400" />
                                                    {payment.agentName || 'Admin'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {paymentHistory.length > 0 && (
                                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                        <tr>
                                            <td colSpan={2} className="p-4 font-bold text-slate-700">Total Paid</td>
                                            <td className="p-4 text-right font-bold text-emerald-600 text-lg">
                                                ₹{paymentHistory.reduce((acc, p) => acc + p.amount, 0).toLocaleString()}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* Balance Summary */}
                    <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm text-slate-500">Remaining Balance</p>
                                <p className={`text-3xl font-bold ${invoiceData?.balance === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    ₹{invoiceData?.balance.toLocaleString()}
                                </p>
                            </div>
                            {invoiceData?.balance === 0 && (
                                <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full">
                                    <span className="text-lg">✓</span>
                                    <span className="font-bold">Fully Paid</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Dealer Statement View
    if (selectedDealer) {
        const { invoices, payments } = getDealerStatement(selectedDealer.id);
        const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.amount, 0);
        const totalPaid = invoices.reduce((acc, inv) => acc + inv.paid, 0);
        const totalBalance = invoices.reduce((acc, inv) => acc + inv.balance, 0);
        const overdueCount = invoices.filter(inv => inv.isOverdue && inv.balance > 0).length;

        return (
            <div className="h-full overflow-y-auto bg-slate-50">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 p-6 sticky top-0 z-10">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setSelectedDealerId(null)}
                                className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors"
                            >
                                <X size={18} />
                            </button>
                            <div>
                                <h1 className="text-xl font-bold text-slate-800">{selectedDealer.businessName}</h1>
                                <p className="text-sm text-slate-500">{selectedDealer.contactPerson} • {selectedDealer.phone}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {selectedDealer.city && `${selectedDealer.city}, `}{selectedDealer.district}
                                    {selectedDealer.pinCode && ` - ${selectedDealer.pinCode}`}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {overdueCount > 0 && (
                                <div className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2">
                                    <AlertTriangle size={14} />
                                    {overdueCount} Overdue
                                </div>
                            )}
                            <button className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors">
                                <Download size={16} />
                                Export PDF
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Total Invoiced</p>
                            <p className="text-xl font-bold text-slate-800">₹{totalInvoiced.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Total Paid</p>
                            <p className="text-xl font-bold text-emerald-600">₹{totalPaid.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Outstanding Balance</p>
                            <p className="text-xl font-bold text-red-600">₹{totalBalance.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-1">Avg. Days to Pay</p>
                            <p className="text-xl font-bold text-blue-600">
                                {invoices.filter(s => s.daysToPay !== null).length > 0
                                    ? Math.round(invoices.filter(s => s.daysToPay !== null).reduce((a, s) => a + (s.daysToPay || 0), 0) / invoices.filter(s => s.daysToPay !== null).length)
                                    : '-'
                                } days
                            </p>
                        </div>
                    </div>

                    {/* FIFO Explanation */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                        <h4 className="font-semibold text-blue-800 mb-1 flex items-center gap-2">
                            <Clock size={16} />
                            FIFO Payment Logic • Click on any invoice to see payment details
                        </h4>
                        <p className="text-sm text-blue-700">
                            Payments are applied to oldest invoices first. Overdue invoices (past due date) are highlighted in red.
                        </p>
                    </div>

                    {/* Statement Table */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <h3 className="font-semibold text-slate-700">Invoice History (FIFO View)</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="p-4 text-left font-medium">
                                            <div className="flex items-center gap-1">
                                                <Calendar size={14} />
                                                Bill Date
                                            </div>
                                        </th>
                                        <th className="p-4 text-left font-medium">Invoice No</th>
                                        <th className="p-4 text-right font-medium">Amount</th>
                                        <th className="p-4 text-right font-medium">Paid</th>
                                        <th className="p-4 text-right font-medium">Balance</th>
                                        <th className="p-4 text-center font-medium">Credit Days</th>
                                        <th className="p-4 text-center font-medium">Due Date</th>
                                        <th className="p-4 text-center font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {invoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-slate-400">
                                                No invoices found for this dealer
                                            </td>
                                        </tr>
                                    ) : (
                                        invoices.map((inv) => {
                                            const isOverdueRow = inv.isOverdue && inv.balance > 0;
                                            return (
                                                <tr
                                                    key={inv.id}
                                                    onClick={() => setSelectedInvoice(inv.transaction)}
                                                    className={`cursor-pointer transition-all ${isOverdueRow
                                                            ? 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500'
                                                            : 'hover:bg-slate-50'
                                                        }`}
                                                >
                                                    <td className="p-4 text-slate-700">
                                                        {inv.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`font-mono px-2 py-1 rounded text-xs font-bold ${isOverdueRow ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                            {inv.referenceId}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right font-medium text-slate-800">
                                                        ₹{inv.amount.toLocaleString()}
                                                    </td>
                                                    <td className="p-4 text-right text-emerald-600 font-medium">
                                                        ₹{inv.paid.toLocaleString()}
                                                    </td>
                                                    <td className="p-4 text-right font-bold text-red-600">
                                                        {inv.balance > 0 ? `₹${inv.balance.toLocaleString()}` : '-'}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className="text-slate-600">{inv.creditDays} days</span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`text-sm ${isOverdueRow ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                                                            {inv.dueDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) || 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        {inv.balance === 0 ? (
                                                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                                                                Paid
                                                            </span>
                                                        ) : isOverdueRow ? (
                                                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center justify-center gap-1">
                                                                <AlertTriangle size={10} />
                                                                {inv.daysOverdue}d overdue
                                                            </span>
                                                        ) : inv.paid > 0 ? (
                                                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">
                                                                Partial
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">
                                                                Pending
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                            <span className="text-blue-600">💡</span>
                            <span>Click on any invoice row to view detailed payment history</span>
                        </div>
                    </div>

                    {/* Collection History */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <h3 className="font-semibold text-slate-700">Collection History</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="p-4 text-left font-medium">Date</th>
                                        <th className="p-4 text-left font-medium">Receipt No</th>
                                        <th className="p-4 text-right font-medium">Amount</th>
                                        <th className="p-4 text-left font-medium">Collected By</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {payments.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400">
                                                No collections recorded yet
                                            </td>
                                        </tr>
                                    ) : (
                                        payments.map((payment, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-4 text-slate-700">
                                                    {payment.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="p-4">
                                                    <span className="font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded text-xs font-bold">
                                                        {payment.receiptId}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right font-bold text-emerald-600">
                                                    ₹{payment.amount.toLocaleString()}
                                                </td>
                                                <td className="p-4 text-slate-600">
                                                    {payment.agentName || 'Admin'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Statement Footer */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex justify-between items-center">
                            <div className="text-sm text-slate-500">
                                Statement generated on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-slate-500">Net Outstanding</p>
                                <p className="text-2xl font-bold text-red-600">₹{totalBalance.toLocaleString()}</p>
                            </div>
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
                    <h1 className="text-2xl font-bold text-slate-800">Dealer Ledgers</h1>
                    <p className="text-sm text-slate-500">View dealer statements and payment history</p>
                </div>
                <div className="bg-slate-100 px-4 py-2 rounded-lg text-sm text-slate-600">
                    Total Dealers: <strong>{dealers.length}</strong>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md mb-6">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                    type="text"
                    placeholder="Search dealers by name, city, district..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Dealer Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDealers.map(d => (
                    <div key={d.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800 leading-tight">{d.businessName}</h3>
                                <p className="text-sm text-slate-500 mt-0.5">{d.contactPerson}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-400 uppercase font-medium">Balance</p>
                                <p className={`font-bold text-lg ${d.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    ₹{d.balance.toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-2">
                                <Building2 size={14} className="text-slate-400" />
                                <span className="truncate">{d.city || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <MapPin size={14} className="text-slate-400" />
                                <span className="truncate">{d.district}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <MapPinned size={14} className="text-slate-400" />
                                <span>PIN: {d.pinCode || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Phone size={14} className="text-slate-400" />
                                <span>{d.phone}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setSelectedDealerId(d.id)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <FileText size={16} />
                            View Statement
                            <ArrowRight size={14} />
                        </button>

                        {d.balance === 0 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Are you sure you want to delete ${d.businessName}?`)) {
                                        deleteDealer(d.id);
                                    }
                                }}
                                className="w-full mt-2 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-red-200"
                            >
                                <Trash2 size={14} />
                                Delete Dealer
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
