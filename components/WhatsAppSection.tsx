'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, Check, X, Loader2, QrCode, LogOut, RefreshCw } from 'lucide-react';
import { logToApplicationSheet } from '@/lib/googleSheetWriter';

export default function WhatsAppSection() {
    const [qr, setQr] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('DISCONNECTED'); // DISCONNECTED, CONNECTING, QR_READY, AUTHENTICATED, READY
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!window.electron?.whatsapp) return;

        // Fetch initial status
        window.electron.whatsapp.getStatus().then(setStatus);

        // Listen for events
        window.electron.whatsapp.onQR((qrDataUrl) => {
            setQr(qrDataUrl);
            setStatus('QR_READY');
        });

        window.electron.whatsapp.onReady(() => {
            setStatus('READY');
            setQr(null);
            logToApplicationSheet('WhatsApp Connected', 'System is READY to send messages');
        });

        window.electron.whatsapp.onAuthenticated(() => {
            setStatus('AUTHENTICATED');
            logToApplicationSheet('WhatsApp Authenticated', 'QR scan successful, initializing session...');
        });

        window.electron.whatsapp.onAuthFailure((msg) => {
            setError(msg);
            setStatus('DISCONNECTED');
            logToApplicationSheet('WhatsApp Auth Failure', `Authentication failed: ${msg}`);
        });

        window.electron.whatsapp.onStatus((newStatus) => {
            setStatus(newStatus);
            if (newStatus !== 'QR_READY') setQr(null);
        });
    }, []);

    const handleLogout = async () => {
        if (!window.electron?.whatsapp) return;
        try {
            await window.electron.whatsapp.logout();
            setStatus('DISCONNECTED');
            setQr(null);
            await logToApplicationSheet('WhatsApp Disconnected', 'User manually disconnected WhatsApp account');
        } catch (err) {
            console.error('Logout failed', err);
        }
    };

    const getStatusUI = () => {
        if (!window.electron?.whatsapp) {
            return (
                <div className="flex items-center gap-2 text-blue-600 font-bold">
                    <Check size={18} />
                    Web Mode Active
                </div>
            );
        }
        switch (status) {
            case 'READY':
                return (
                    <div className="flex items-center gap-2 text-emerald-600 font-bold">
                        <Check size={18} />
                        Connected & Ready
                    </div>
                );
            case 'AUTHENTICATED':
                return (
                    <div className="flex items-center gap-2 text-blue-600 font-bold">
                        <Loader2 size={18} className="animate-spin" />
                        Authenticated, starting...
                    </div>
                );
            case 'QR_READY':
                return (
                    <div className="flex items-center gap-2 text-amber-600 font-bold">
                        <QrCode size={18} />
                        Scan QR Code to Link
                    </div>
                );
            case 'CONNECTING':
                return (
                    <div className="flex items-center gap-2 text-slate-500 font-bold">
                        <Loader2 size={18} className="animate-spin" />
                        Connecting...
                    </div>
                );
            default:
                return (
                    <div className="flex items-center gap-2 text-slate-400 font-bold">
                        <X size={18} />
                        Disconnected
                    </div>
                );
        }
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <MessageSquare size={20} className="text-emerald-500" />
                    WhatsApp Automation
                </h2>
                {getStatusUI()}
            </div>

            {!window.electron && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                    <MessageSquare size={18} className="text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700">
                        <p className="font-bold">Web Browser Mode</p>
                        <p className="text-xs mt-1">Automated background sending requires the Desktop App. On the web version, a WhatsApp link will open for manual sending.</p>
                    </div>
                </div>
            )}

            {window.electron ? (
                /* DESKTOP MODE UI */
                <div className="flex flex-col md:flex-row gap-8 items-center">
                    {/* QR Code Section */}
                    {status === 'QR_READY' && qr ? (
                        <div className="bg-white p-4 border-2 border-slate-100 rounded-2xl shadow-sm">
                            <img src={qr} alt="WhatsApp QR Code" className="w-48 h-48" />
                            <p className="text-center text-xs text-slate-500 mt-2 font-medium">Scan with your phone</p>
                        </div>
                    ) : status === 'READY' ? (
                        <div className="w-48 h-48 bg-emerald-50 rounded-2xl flex flex-col items-center justify-center border-2 border-emerald-100 border-dashed">
                            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                                <Check size={32} className="text-emerald-600" />
                            </div>
                            <p className="text-sm font-bold text-emerald-700 uppercase tracking-wider">Account Linked</p>
                        </div>
                    ) : (
                        <div className="w-48 h-48 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border-2 border-slate-100 border-dashed">
                            {status === 'CONNECTING' ? (
                                <Loader2 size={32} className="text-slate-300 animate-spin" />
                            ) : (
                                <MessageSquare size={32} className="text-slate-200" />
                            )}
                            <p className="text-xs text-slate-400 mt-3 font-medium text-center px-4">
                                {status === 'CONNECTING' ? 'Starting services...' : 'Initializing WhatsApp connection...'}
                            </p>
                        </div>
                    )}

                    {/* Info & Actions */}
                    <div className="flex-1 space-y-4">
                        <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 border border-slate-100">
                            <ul className="space-y-2">
                                <li className="flex gap-2">
                                    <Check size={14} className="text-emerald-500 mt-0.5" />
                                    <span>Automatic invoice sending on generation.</span>
                                </li>
                                <li className="flex gap-2">
                                    <Check size={14} className="text-emerald-500 mt-0.5" />
                                    <span>Send statements to dealers instantly.</span>
                                </li>
                                <li className="flex gap-2">
                                    <Check size={14} className="text-emerald-500 mt-0.5" />
                                    <span>Reach dealers directly on their mobile.</span>
                                </li>
                            </ul>
                        </div>

                        <div className="flex gap-3">
                            {status === 'READY' ? (
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-bold"
                                >
                                    <LogOut size={16} />
                                    Disconnect Account
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        window.electron.whatsapp.reconnect();
                                        logToApplicationSheet('WhatsApp Reconnect Requested', 'User triggered Re-sync Connection');
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-all border border-slate-800 shadow-sm"
                                >
                                    <RefreshCw size={16} />
                                    Re-sync Connection
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* WEB MODE UI */
                <div className="flex-1 space-y-4">
                    <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 border border-slate-100">
                        <ul className="space-y-2">
                            <li className="flex gap-2">
                                <Check size={14} className="text-emerald-500 mt-0.5" />
                                <span>Manual sending via WhatsApp Web/Mobile.</span>
                            </li>
                            <li className="flex gap-2">
                                <Check size={14} className="text-emerald-500 mt-0.5" />
                                <span>No secondary browser required.</span>
                            </li>
                            <li className="flex gap-2">
                                <Check size={14} className="text-emerald-500 mt-0.5" />
                                <span>Ideal for quick testing and small volumes.</span>
                            </li>
                        </ul>
                    </div>
                </div>
            )}

            {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs flex items-center gap-2">
                    <X size={14} />
                    {error}
                </div>
            )}
        </div>
    );
}
