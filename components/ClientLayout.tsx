'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { DataProvider } from '@/contexts/DataContext';
import { ViewState } from '@/types';

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem('isAuthenticated') === 'true';
        }
        return null;
    });

    // Handle client-side mounting
    useEffect(() => {
        setMounted(true);
    }, []);

    // Re-sync auth status if session storage changes (optional but good for consistency)
    useEffect(() => {
        if (mounted) {
            const authStatus = sessionStorage.getItem('isAuthenticated') === 'true';
            if (authStatus !== isAuthenticated) {
                setIsAuthenticated(authStatus);
            }
        }
    }, [pathname, mounted, isAuthenticated]);

    // Check if on login page (handles both /login and /login/)
    const isLoginPage = pathname === '/login' || pathname === '/login/';

    // Handle redirect based on authentication status
    useEffect(() => {
        if (!mounted || isAuthenticated === null) return;

        if (!isLoginPage && !isAuthenticated) {
            // Not on login page and not authenticated - redirect to login
            router.replace('/login');
        } else if (isLoginPage && isAuthenticated) {
            // On login page but already authenticated - redirect to dashboard
            router.replace('/');
        }
    }, [mounted, isLoginPage, isAuthenticated, router]);

    // Map pathname to ViewState for active state detection
    const getViewState = (): ViewState => {
        if (pathname?.includes('/billing')) return 'BILLING';
        if (pathname?.includes('/inventory')) return 'INVENTORY';
        if (pathname?.includes('/purchases')) return 'PURCHASES';
        if (pathname?.includes('/customers')) return 'DEALERS';
        if (pathname?.includes('/collections')) return 'COLLECTIONS';
        if (pathname?.includes('/agents')) return 'AGENTS';
        if (pathname?.includes('/settings')) return 'SETTINGS';
        return 'DASHBOARD';
    };

    const currentView = getViewState();

    // Login page - just render children directly (no auth check needed)
    if (isLoginPage) {
        return (
            <DataProvider>
                {children}
            </DataProvider>
        );
    }

    // Show loading spinner while mounting or checking auth (client-side hydration)
    if (!mounted || isAuthenticated === null) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-400 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    // Not authenticated - show loading (redirect is happening)
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-400 text-sm">Redirecting to login...</p>
                </div>
            </div>
        );
    }

    // Authenticated - show full layout with sidebar
    return (
        <DataProvider>
            <div className="flex h-screen bg-slate-50 overflow-hidden print:h-auto print:overflow-visible">
                <div className="print:hidden">
                    <Sidebar currentView={currentView} />
                </div>

                <div className="flex-1 flex flex-col h-full overflow-hidden relative print:h-auto print:overflow-visible">
                    <header className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center shrink-0 print:hidden">
                        <div className="flex items-center gap-3">
                            <img src="/icon.png" alt="Logo" className="w-8 h-8 object-contain" />
                            <div className="font-bold text-emerald-600 text-lg">Sri Vari Enterprises</div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Admin Portal</span>
                            <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                A
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 overflow-hidden relative print:h-auto print:overflow-visible">
                        {children}
                    </main>
                </div>
            </div>

            {/* Global Map Preloader - Loads tiles and assets in the background */}
            {mounted && (
                <div className="absolute opacity-0 pointer-events-none" style={{ left: '-9999px', top: '-9999px', width: '100px', height: '100px', overflow: 'hidden' }}>
                    <DynamicMap agentData={[]} />
                </div>
            )}
        </DataProvider>
    );
}

// Low-overhead dynamic import for preloader
const DynamicMap = dynamic(() => import('./LiveMap').then(mod => mod.LiveMap), {
    ssr: false,
    loading: () => null
});
