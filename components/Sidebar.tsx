'use client';

import React from 'react';
import Link from 'next/link';
import { LayoutDashboard, ShoppingCart, Users, FileText, Wallet, LogOut, Settings } from 'lucide-react';
import { ViewState } from '@/types';

interface SidebarProps {
  currentView: ViewState;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView }) => {
  const menuItems = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard, href: '/' },
    { id: 'BILLING', label: 'New Invoice', icon: FileText, href: '/billing' },
    { id: 'INVENTORY', label: 'Stock & Products', icon: ShoppingCart, href: '/inventory' },
    { id: 'DEALERS', label: 'Ledger & Dealers', icon: Users, href: '/customers' },
    { id: 'COLLECTIONS', label: 'Collections', icon: Wallet, href: '/collections' },
    { id: 'SETTINGS', label: 'Settings', icon: Settings, href: '/settings' },
  ];

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    window.location.href = '/login';
  };

  return (
    <div className="w-64 bg-slate-900 text-white h-full flex-col hidden md:flex shadow-xl">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-tight text-emerald-400">Sri Vari Enterprises</h1>
        <p className="text-xs text-slate-400 mt-1">Admin Billing Portal</p>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-800 space-y-3">
        <div className="bg-slate-800 rounded-lg p-3">
          <p className="text-xs text-slate-400">System Status</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-medium">All Systems Active</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
        >
          <LogOut size={18} />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
};