import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType, focusSelector?: string) => void;
    toasts: Toast[];
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType, focusSelector?: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);

        // Auto remove after 5 seconds
        setTimeout(() => {
            removeToast(id);
        }, 5000);

        // Handle field focusing if requested
        if (focusSelector) {
            setTimeout(() => {
                const element = document.querySelector(focusSelector) as HTMLElement;
                if (element) {
                    element.focus();
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Visual feedback for focus
                    element.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
                    setTimeout(() => {
                        element.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2');
                    }, 3000);
                }
            }, 100);
        }
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ showToast, toasts, removeToast }}>
            {children}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
