'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ConfirmationOptions {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: 'danger' | 'warning' | 'info';
}

interface ConfirmationContextType {
    showConfirm: (options: ConfirmationOptions) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextType | undefined>(undefined);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmationOptions | null>(null);
    const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

    const showConfirm = useCallback((newOptions: ConfirmationOptions) => {
        setOptions(newOptions);
        setIsOpen(true);
        return new Promise<boolean>((resolve) => {
            setResolver(() => resolve);
        });
    }, []);

    const handleConfirm = useCallback(() => {
        setIsOpen(false);
        if (resolver) resolver(true);
    }, [resolver]);

    const handleCancel = useCallback(() => {
        setIsOpen(false);
        if (resolver) resolver(false);
    }, [resolver]);

    return (
        <ConfirmationContext.Provider value={{ showConfirm }}>
            {children}
            {isOpen && options && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={handleCancel}
                    />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden z-10 animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-slate-800 mb-2">
                                {options.title || 'Are you sure?'}
                            </h3>
                            <p className="text-slate-600">
                                {options.message}
                            </p>
                        </div>
                        <div className="p-4 bg-slate-50 flex gap-3 border-t border-slate-100">
                            <button
                                onClick={handleCancel}
                                className="flex-1 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
                            >
                                {options.cancelLabel || 'Cancel'}
                            </button>
                            <button
                                onClick={handleConfirm}
                                className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg transition-all ${options.type === 'danger'
                                        ? 'bg-red-500 hover:bg-red-600 shadow-red-100'
                                        : options.type === 'warning'
                                            ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100'
                                            : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                                    }`}
                            >
                                {options.confirmLabel || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmationContext.Provider>
    );
}

export function useConfirm() {
    const context = useContext(ConfirmationContext);
    if (context === undefined) {
        throw new Error('useConfirm must be used within a ConfirmationProvider');
    }
    return context;
}
