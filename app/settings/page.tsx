'use client';

import React, { useState, useEffect } from 'react';
import { Settings, User, Lock, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import WhatsAppSection from '@/components/WhatsAppSection';

export default function SettingsPage() {
    const [currentUsername, setCurrentUsername] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        // Load current username
        const storedUsername = localStorage.getItem('adminUsername') || 'SVadmin';
        setCurrentUsername(storedUsername);
    }, []);

    // Password validation function
    const validatePassword = (pwd: string): { valid: boolean; message: string } => {
        if (pwd.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters' };
        }
        if (!/[A-Z]/.test(pwd)) {
            return { valid: false, message: 'Password must contain at least 1 capital letter' };
        }
        if (!/[0-9]/.test(pwd)) {
            return { valid: false, message: 'Password must contain at least 1 number' };
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
            return { valid: false, message: 'Password must contain at least 1 special character' };
        }
        return { valid: true, message: '' };
    };

    const handleUpdateUsername = (e: React.FormEvent) => {
        e.preventDefault();

        if (!newUsername.trim()) {
            setMessage({ type: 'error', text: 'Username cannot be empty' });
            return;
        }

        localStorage.setItem('adminUsername', newUsername);
        setCurrentUsername(newUsername);
        setNewUsername('');
        setMessage({ type: 'success', text: 'Username updated successfully!' });

        setTimeout(() => setMessage(null), 3000);
    };

    const handleUpdatePassword = (e: React.FormEvent) => {
        e.preventDefault();

        // Verify current password
        const storedPassword = localStorage.getItem('adminPassword') || 'Srivari@123';
        if (currentPassword !== storedPassword) {
            setMessage({ type: 'error', text: 'Current password is incorrect' });
            return;
        }

        // Validate new password
        const validation = validatePassword(newPassword);
        if (!validation.valid) {
            setMessage({ type: 'error', text: validation.message });
            return;
        }

        // Check if passwords match
        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        // Save new password
        localStorage.setItem('adminPassword', newPassword);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setMessage({ type: 'success', text: 'Password updated successfully!' });

        setTimeout(() => setMessage(null), 3000);
    };

    return (
        <div className="h-full overflow-y-auto p-6 bg-slate-50">
            <div className="max-w-2xl mx-auto">
                {/* WhatsApp Connection Section */}
                <WhatsAppSection />

                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <Settings className="text-emerald-600" size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Admin Settings</h1>
                        <p className="text-sm text-slate-500">Manage your account credentials</p>
                    </div>
                </div>

                {/* Message */}
                {message && (
                    <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${message.type === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                        {message.text}
                    </div>
                )}

                {/* Change Username */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <User size={20} className="text-slate-500" />
                        Change Username
                    </h2>
                    <p className="text-sm text-slate-500 mb-4">
                        Current username: <span className="font-medium text-slate-700">{currentUsername}</span>
                    </p>
                    <form onSubmit={handleUpdateUsername} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">New Username</label>
                            <input
                                type="text"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                placeholder="Enter new username"
                            />
                        </div>
                        <button
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
                        >
                            Update Username
                        </button>
                    </form>
                </div>

                {/* Change Password */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Lock size={20} className="text-slate-500" />
                        Change Password
                    </h2>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                        <p className="text-xs text-amber-700">
                            <strong>Password Requirements:</strong> Minimum 8 characters, 1 capital letter, 1 number, 1 special character
                        </p>
                    </div>
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        {/* Current Password */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Current Password</label>
                            <div className="relative">
                                <input
                                    type={showCurrentPassword ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="Enter current password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* New Password */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">New Password</label>
                            <div className="relative">
                                <input
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="Enter new password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Confirm New Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="Confirm new password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
                        >
                            Update Password
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
