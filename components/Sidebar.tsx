'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, ShoppingCart, Users, FileText, Wallet, LogOut, Settings, UserCheck, ShoppingBag, RefreshCw } from 'lucide-react';
import { ViewState } from '@/types';
import { useData } from '@/contexts/DataContext';
import { logToApplicationSheet } from '@/lib/googleSheetWriter';

interface SidebarProps {
  currentView: ViewState;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView }) => {
  const router = useRouter();
  const { refreshData } = useData();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const menuItems = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard, href: '/' },
    { id: 'BILLING', label: 'New Invoice', icon: FileText, href: '/billing' },
    { id: 'INVENTORY', label: 'Stock & Products', icon: ShoppingCart, href: '/inventory' },
    { id: 'PURCHASES', label: 'Purchases', icon: ShoppingBag, href: '/purchases' },
    { id: 'DEALERS', label: 'Ledger & Dealers', icon: Users, href: '/customers' },
    { id: 'AGENTS', label: 'Collection Agents & Expenses', icon: UserCheck, href: '/agents?tab=overview' },
    { id: 'SETTINGS', label: 'Settings', icon: Settings, href: '/settings' },
  ];

  // Reset highlight when page changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement as HTMLElement)?.isContentEditable;

      if (isInputFocused && e.key !== 'Escape') return;

      // Escape key returns focus to sidebar from anywhere
      if (e.key === 'Escape') {
        if (isInputFocused) {
          (activeElement as HTMLElement)?.blur();
        }
        // Force highlight to current view
        const currentIndex = menuItems.findIndex(item => item.id === currentView);
        if (currentIndex >= 0) {
          setHighlightedIndex(currentIndex);
        }
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();

        // Start from current page if no highlight yet
        const startIndex = highlightedIndex >= 0
          ? highlightedIndex
          : menuItems.findIndex(item => item.id === currentView);

        let nextIndex = startIndex;
        if (e.key === 'ArrowDown') {
          nextIndex = (startIndex + 1) % menuItems.length;
        } else if (e.key === 'ArrowUp') {
          nextIndex = (startIndex - 1 + menuItems.length) % menuItems.length;
        }

        setHighlightedIndex(nextIndex);
        return;
      }

      if (e.key === 'Enter' && highlightedIndex >= 0) {
        e.preventDefault();
        const selectedItem = menuItems[highlightedIndex];
        if (selectedItem) {
          router.push(selectedItem.href);
          setHighlightedIndex(-1);

          // Auto-focus the key input on the target page after navigation
          setTimeout(() => {
            const focusTargetMap: Record<string, string> = {
              'BILLING': '#invoice-no-field',
              'INVENTORY': '#inventory-search',
              'PURCHASES': '#purchases-search',
              'DEALERS': '#dealers-search',
            };
            const selector = focusTargetMap[selectedItem.id];
            if (selector) {
              const el = document.querySelector(selector) as HTMLElement;
              if (el) { el.focus(); el.click?.(); }
            }
          }, 400);
        }
        return;
      }

      // Escape clears highlight
      if (e.key === 'Escape' && highlightedIndex >= 0) {
        setHighlightedIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, router, menuItems, highlightedIndex]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (refreshData) {
        await refreshData();
      }
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      // Minimum loading time for visual feedback
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleLogout = async () => {
    const user = sessionStorage.getItem('username');
    await logToApplicationSheet('User Logout', `User ${user || 'unknown'} signed out`);
    sessionStorage.removeItem('isAuthenticated');
    window.location.href = '/login';
  };

  return (
    <div className="w-64 bg-slate-900 text-white h-full flex-col hidden md:flex shadow-xl">
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <img src="/icon.png" alt="Logo" className="w-10 h-10 object-contain drop-shadow-lg" />
        <div>
          <h1 className="text-lg font-bold tracking-tight text-emerald-400 leading-tight">Sri Vari Enterprises</h1>
          <p className="text-xs text-slate-400">Admin Billing Portal</p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const isHighlighted = highlightedIndex === index;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => {
                setHighlightedIndex(-1);
                setTimeout(() => {
                  const focusTargetMap: Record<string, string> = {
                    'BILLING': '#invoice-no-field',
                    'INVENTORY': '#inventory-search',
                    'PURCHASES': '#purchases-search',
                    'DEALERS': '#dealers-search',
                  };
                  const selector = focusTargetMap[item.id];
                  if (selector) {
                    const el = document.querySelector(selector) as HTMLElement;
                    if (el) { el.focus(); el.click?.(); }
                  }
                }, 400);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                ? 'bg-emerald-600 text-white shadow-lg'
                : isHighlighted
                  ? 'bg-slate-700 text-white ring-2 ring-emerald-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
              {isHighlighted && !isActive && (
                <span className="ml-auto text-[10px] text-emerald-400 font-bold">↵ Enter</span>
              )}
            </Link>
          );
        })}

        <div className="pt-4 mt-4 border-t border-slate-800 space-y-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={20} className={isRefreshing ? "animate-spin" : ""} />
            <span className="font-medium">{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
