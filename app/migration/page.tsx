'use client';

import React, { useState, useEffect } from 'react';
import { SupplierData, PurchaseBillData, PurchasePaymentData } from '../../types';
import { Sidebar } from '../../components/Sidebar';

export default function MigrationPage() {
    const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [log, setLog] = useState<string[]>([]);
    const [stats, setStats] = useState({
        suppliers: 0,
        bills: 0,
        payments: 0
    });

    const addLog = (msg: string) => setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

    const runMigration = async () => {
        setStatus('LOADING');
        setLog([]);
        addLog("Starting migration...");

        try {
            // 1. Fetch Suppliers
            addLog("Fetching suppliers.json...");
            const supRes = await fetch('/migration/suppliers.json');
            if (!supRes.ok) throw new Error("Failed to load suppliers.json");
            const suppliers: SupplierData[] = await supRes.json();
            addLog(`Loaded ${suppliers.length} suppliers.`);

            // 2. Fetch Bills
            addLog("Fetching bills.json...");
            const billRes = await fetch('/migration/bills.json');
            if (!billRes.ok) throw new Error("Failed to load bills.json");
            const bills: PurchaseBillData[] = await billRes.json();
            addLog(`Loaded ${bills.length} bills.`);

            // 3. Fetch Payments
            addLog("Fetching payments.json...");
            const payRes = await fetch('/migration/payments.json');
            if (!payRes.ok) throw new Error("Failed to load payments.json");
            const payments: PurchasePaymentData[] = await payRes.json();
            addLog(`Loaded ${payments.length} payments.`);

            // 4. Validate and Save to LocalStorage
            // Check existing data? Maybe merge or overwrite?
            // For now, let's Append? Or Overwrite if user confirms?
            // Since migration is typically a one-time setup or reset, overwrite is safer for consistency if fresh.
            // But user might have data.
            // I'll merge by ID check.

            addLog("Saving to LocalStorage...");

            const existingSuppliersStr = localStorage.getItem('sve_suppliers');
            const existingSuppliers: SupplierData[] = existingSuppliersStr ? JSON.parse(existingSuppliersStr) : [];
            let newSupCount = 0;
            suppliers.forEach(s => {
                if (!existingSuppliers.find(ex => ex.id === s.id)) {
                    existingSuppliers.push(s);
                    newSupCount++;
                }
            });
            localStorage.setItem('sve_suppliers', JSON.stringify(existingSuppliers));
            addLog(`Added ${newSupCount} new suppliers.`);

            const existingBillsStr = localStorage.getItem('sve_purchase_bills');
            const existingBills: PurchaseBillData[] = existingBillsStr ? JSON.parse(existingBillsStr) : [];
            let newBillCount = 0;
            bills.forEach(b => {
                if (!existingBills.find(ex => ex.id === b.id)) {
                    existingBills.push(b);
                    newBillCount++;
                }
            });
            localStorage.setItem('sve_purchase_bills', JSON.stringify(existingBills));
            addLog(`Added ${newBillCount} new bills.`);

            const existingPaymentsStr = localStorage.getItem('sve_purchase_payments');
            const existingPayments: PurchasePaymentData[] = existingPaymentsStr ? JSON.parse(existingPaymentsStr) : [];
            let newPayCount = 0;
            payments.forEach(p => {
                if (!existingPayments.find(ex => ex.id === p.id)) {
                    existingPayments.push(p);
                    newPayCount++;
                }
            });
            localStorage.setItem('sve_purchase_payments', JSON.stringify(existingPayments));
            addLog(`Added ${newPayCount} new payments.`);

            setStats({
                suppliers: existingSuppliers.length,
                bills: existingBills.length,
                payments: existingPayments.length
            });

            setStatus('SUCCESS');
            addLog("Migration completed successfully!");

        } catch (err: any) {
            console.error(err);
            setStatus('ERROR');
            addLog(`Error: ${err.message}`);
        }
    };

    const clearData = () => {
        if (confirm("Are you sure you want to clear ALL purchase data (Suppliers, Bills, Payments)? This cannot be undone.")) {
            localStorage.removeItem('sve_suppliers');
            localStorage.removeItem('sve_purchase_bills');
            localStorage.removeItem('sve_purchase_payments');
            localStorage.removeItem('sve_purchase_allocations');
            addLog("Cleared all purchase data.");
            setStats({ suppliers: 0, bills: 0, payments: 0 });
        }
    }

    return (
        <div className="flex h-screen bg-gray-50">
            <Sidebar currentView='SETTINGS' />
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm z-10 p-4">
                    <h1 className="text-2xl font-bold text-gray-800">Data Migration</h1>
                </header>

                <main className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
                        <div className="mb-6">
                            <h2 className="text-xl font-semibold mb-2">Import Tally Data</h2>
                            <p className="text-gray-600 mb-4">
                                Import Suppliers, Purchase Bills, and Payments exported from Tally.
                                Make sure you have run the conversion script to generate the JSON files in <code>public/migration/</code>.
                            </p>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => runMigration()}
                                    disabled={status === 'LOADING'}
                                    className={`px-6 py-2 rounded text-white font-medium ${status === 'LOADING' ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                                        }`}
                                >
                                    {status === 'LOADING' ? 'Migrating...' : 'Start Migration'}
                                </button>

                                <button
                                    onClick={() => clearData()}
                                    className="px-6 py-2 rounded text-red-600 border border-red-200 hover:bg-red-50 font-medium"
                                >
                                    Clear Existing Data
                                </button>
                            </div>
                        </div>

                        {/* Logs */}
                        <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto border border-gray-700">
                            {log.length === 0 ? (
                                <span className="text-gray-500 italic">Ready to start...</span>
                            ) : (
                                log.map((line, i) => <div key={i}>{line}</div>)
                            )}
                        </div>

                        {/* Stats */}
                        {status === 'SUCCESS' && (
                            <div className="mt-6 grid grid-cols-3 gap-4">
                                <div className="bg-green-50 p-4 rounded border border-green-100">
                                    <div className="text-sm text-green-600">Total Suppliers</div>
                                    <div className="text-2xl font-bold text-green-800">{stats.suppliers}</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded border border-blue-100">
                                    <div className="text-sm text-blue-600">Total Bills</div>
                                    <div className="text-2xl font-bold text-blue-800">{stats.bills}</div>
                                </div>
                                <div className="bg-purple-50 p-4 rounded border border-purple-100">
                                    <div className="text-sm text-purple-600">Total Payments</div>
                                    <div className="text-2xl font-bold text-purple-800">{stats.payments}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
