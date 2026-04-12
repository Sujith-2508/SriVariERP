'use client';

import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ConnectivityBanner() {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        // Set initial state
        setIsOffline(!navigator.onLine);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleRetry = () => {
        window.location.reload();
    };

    return (
        <AnimatePresence>
            {isOffline && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    className="fixed top-0 left-0 right-0 z-[9999] px-4 py-3 bg-red-600 text-white shadow-2xl flex items-center justify-between border-b border-red-500/20 backdrop-blur-md bg-opacity-95"
                >
                    <div className="flex items-center gap-3 max-w-4xl mx-auto w-full">
                        <div className="bg-white/20 p-2 rounded-lg">
                            <WifiOff size={20} className="animate-pulse" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-sm sm:text-base leading-tight">No Internet Connection</h3>
                            <p className="text-red-100 text-xs sm:text-sm opacity-90">
                                You are offline. Some features like Google Sheets sync and Supabase updates will not work.
                            </p>
                        </div>
                        <button
                            onClick={handleRetry}
                            className="flex items-center gap-2 bg-white text-red-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-red-50 transition-colors shadow-sm ml-4 whitespace-nowrap"
                        >
                            <RefreshCw size={14} />
                            Retry
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
