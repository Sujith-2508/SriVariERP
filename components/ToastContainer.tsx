import React from 'react';
import { useToast, ToastType } from '@/contexts/ToastContext';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useToast();

    if (toasts.length === 0) return null;

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success': return <CheckCircle className="text-emerald-500" size={20} />;
            case 'error': return <AlertCircle className="text-red-500" size={20} />;
            case 'warning': return <AlertTriangle className="text-amber-500" size={20} />;
            case 'info': return <Info className="text-blue-500" size={20} />;
        }
    };

    const getColors = (type: ToastType) => {
        switch (type) {
            case 'success': return 'bg-emerald-50 border-emerald-200 text-emerald-800';
            case 'error': return 'bg-red-50 border-red-200 text-red-800';
            case 'warning': return 'bg-amber-50 border-amber-200 text-amber-800';
            case 'info': return 'bg-blue-50 border-blue-200 text-blue-800';
        }
    };

    return (
        <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-md w-full">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 shadow-xl animate-in fade-in slide-in-from-right-4 duration-300 ${getColors(toast.type)}`}
                >
                    <div className="shrink-0 mt-0.5">
                        {getIcon(toast.type)}
                    </div>
                    <div className="flex-1 text-sm font-semibold leading-relaxed">
                        {toast.message}
                    </div>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            ))}
        </div>
    );
};
