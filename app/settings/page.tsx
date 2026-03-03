'use client';

import React, { useState, useEffect } from 'react';
import { Settings, User, Lock, Eye, EyeOff, Check, AlertCircle, HardDrive, Building2, Landmark } from 'lucide-react';
import WhatsAppSection from '@/components/WhatsAppSection';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
    // â”€â”€â”€ Admin credentials â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [currentUsername, setCurrentUsername] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [driveEmail, setDriveEmail] = useState('');

    // â”€â”€â”€ Company & Bank Details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [companySettingsId, setCompanySettingsId] = useState<string | null>(null);
    const [companyName, setCompanyName] = useState('');
    const [addressLine1, setAddressLine1] = useState('');
    const [addressLine2, setAddressLine2] = useState('');
    const [city, setCity] = useState('');
    const [stateField, setStateField] = useState('');
    const [pinCode, setPinCode] = useState('');
    const [gstNumber, setGstNumber] = useState('');
    const [panNumber, setPanNumber] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    // Bank details
    const [bankName, setBankName] = useState('');
    const [bankBranch, setBankBranch] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [ifscCode, setIfscCode] = useState('');
    const [accountHolderName, setAccountHolderName] = useState('');
    const [accountType, setAccountType] = useState('Current A/c');
    const [companySaving, setCompanySaving] = useState(false);
    const [companyMessage, setCompanyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const storedUsername = localStorage.getItem('adminUsername') || 'SVadmin';
        setCurrentUsername(storedUsername);
        const storedDriveEmail = localStorage.getItem('googleDriveEmail') || '';
        setDriveEmail(storedDriveEmail);

        // Load company settings from Supabase
        const loadCompany = async () => {
            const { data, error } = await supabase.from('company_settings').select('*').limit(1);
            if (!error && data && data.length > 0) {
                const s = data[0];
                setCompanySettingsId(s.id);
                setCompanyName(s.company_name || '');
                setAddressLine1(s.address_line1 || '');
                setAddressLine2(s.address_line2 || '');
                setCity(s.city || '');
                setStateField(s.state || '');
                setPinCode(s.pin_code || '');
                setGstNumber(s.gst_number || '');
                setPanNumber(s.pan_number || '');
                setPhone(s.phone || '');
                setEmail(s.email || '');
                setBankName(s.bank_name || '');
                setBankBranch(s.bank_branch || '');
                setAccountNumber(s.account_number || '');
                setIfscCode(s.ifsc_code || '');
                setAccountHolderName(s.account_holder_name || '');
                setAccountType(s.account_type || 'Current A/c');
            }
        };
        loadCompany();
    }, []);

    const handleSaveCompanySettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setCompanySaving(true);
        setCompanyMessage(null);
        try {
            const payload = {
                company_name: companyName.trim(),
                address_line1: addressLine1.trim(),
                address_line2: addressLine2.trim(),
                city: city.trim(),
                state: stateField.trim(),
                pin_code: pinCode.trim(),
                gst_number: gstNumber.trim().toUpperCase(),
                pan_number: panNumber.trim().toUpperCase(),
                phone: phone.trim(),
                email: email.trim(),
                bank_name: bankName.trim(),
                bank_branch: bankBranch.trim(),
                account_number: accountNumber.trim(),
                ifsc_code: ifscCode.trim().toUpperCase(),
                account_holder_name: accountHolderName.trim(),
                account_type: accountType.trim(),
            };

            let error;
            if (companySettingsId) {
                // Update existing row
                ({ error } = await supabase.from('company_settings').update(payload).eq('id', companySettingsId));
            } else {
                // Insert new row
                const { data, error: insertError } = await supabase.from('company_settings').insert(payload).select().single();
                error = insertError;
                if (data) setCompanySettingsId(data.id);
            }

            if (error) throw error;
            setCompanyMessage({ type: 'success', text: 'Company & bank details saved! Invoices will now use these details.' });
        } catch (err: any) {
            setCompanyMessage({ type: 'error', text: err.message || 'Failed to save. Please try again.' });
        } finally {
            setCompanySaving(false);
            setTimeout(() => setCompanyMessage(null), 4000);
        }
    };

    const handleSaveDriveEmail = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = driveEmail.trim();
        if (trimmed) {
            localStorage.setItem('googleDriveEmail', trimmed);
        } else {
            localStorage.removeItem('googleDriveEmail');
        }
        setMessage({ type: 'success', text: trimmed ? 'Google Drive email saved!' : 'Google Drive email cleared.' });
        setTimeout(() => setMessage(null), 3000);
    };

    const validatePassword = (pwd: string): { valid: boolean; message: string } => {
        if (pwd.length < 8) return { valid: false, message: 'Password must be at least 8 characters' };
        if (!/[A-Z]/.test(pwd)) return { valid: false, message: 'Password must contain at least 1 capital letter' };
        if (!/[0-9]/.test(pwd)) return { valid: false, message: 'Password must contain at least 1 number' };
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return { valid: false, message: 'Password must contain at least 1 special character' };
        return { valid: true, message: '' };
    };

    const handleUpdateUsername = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername.trim()) { setMessage({ type: 'error', text: 'Username cannot be empty' }); return; }
        localStorage.setItem('adminUsername', newUsername);
        setCurrentUsername(newUsername);
        setNewUsername('');
        setMessage({ type: 'success', text: 'Username updated successfully!' });
        setTimeout(() => setMessage(null), 3000);
    };

    const handleUpdatePassword = (e: React.FormEvent) => {
        e.preventDefault();
        const storedPassword = localStorage.getItem('adminPassword') || 'Srivari@123';
        if (currentPassword !== storedPassword) { setMessage({ type: 'error', text: 'Current password is incorrect' }); return; }
        const validation = validatePassword(newPassword);
        if (!validation.valid) { setMessage({ type: 'error', text: validation.message }); return; }
        if (newPassword !== confirmPassword) { setMessage({ type: 'error', text: 'New passwords do not match' }); return; }
        localStorage.setItem('adminPassword', newPassword);
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        setMessage({ type: 'success', text: 'Password updated successfully!' });
        setTimeout(() => setMessage(null), 3000);
    };

    const inputCls = "w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm";
    const labelCls = "block text-xs font-semibold text-slate-600 mb-1";

    return (
        <div className="h-full overflow-y-auto p-6 bg-slate-50">
            <div className="max-w-2xl mx-auto space-y-6">

                {/* â”€â”€ Company Details â”€â”€ */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                        <Building2 size={20} className="text-emerald-600" />
                        Company Details
                    </h2>
                    <p className="text-xs text-slate-400 mb-5">Shown on every printed invoice. Keep this accurate.</p>

                    {companyMessage && (
                        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${companyMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            {companyMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                            {companyMessage.text}
                        </div>
                    )}

                    <form onSubmit={handleSaveCompanySettings} className="space-y-4">
                        {/* Company Name */}
                        <div>
                            <label className={labelCls}>Company Name *</label>
                            <input className={inputCls} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Sri Vari Enterprises" required />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Address Line 1</label>
                                <input className={inputCls} value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="Street / Door No." />
                            </div>
                            <div>
                                <label className={labelCls}>Address Line 2</label>
                                <input className={inputCls} value={addressLine2} onChange={e => setAddressLine2(e.target.value)} placeholder="Area / Landmark" />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className={labelCls}>City</label>
                                <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Chennai" />
                            </div>
                            <div>
                                <label className={labelCls}>State</label>
                                <input className={inputCls} value={stateField} onChange={e => setStateField(e.target.value)} placeholder="e.g. Tamil Nadu" />
                            </div>
                            <div>
                                <label className={labelCls}>Pin Code</label>
                                <input className={inputCls} value={pinCode} onChange={e => setPinCode(e.target.value.replace(/[^0-9]/g, ''))} placeholder="600001" maxLength={6} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>GST Number</label>
                                <input className={inputCls} value={gstNumber} onChange={e => setGstNumber(e.target.value.toUpperCase())} placeholder="e.g. 33AAAAA0000A1Z5" />
                            </div>
                            <div>
                                <label className={labelCls}>PAN Number</label>
                                <input className={inputCls} value={panNumber} onChange={e => setPanNumber(e.target.value.toUpperCase())} placeholder="e.g. AAAAA0000A" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Phone</label>
                                <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" />
                            </div>
                            <div>
                                <label className={labelCls}>Email</label>
                                <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="office@srivari.com" />
                            </div>
                        </div>

                        {/* Bank Details separator */}
                        <div className="flex items-center gap-3 pt-2">
                            <Landmark size={16} className="text-emerald-600 shrink-0" />
                            <span className="text-sm font-bold text-slate-700">Bank Details</span>
                            <div className="flex-1 h-px bg-slate-200" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Bank Name</label>
                                <input className={inputCls} value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. State Bank of India" />
                            </div>
                            <div>
                                <label className={labelCls}>Branch</label>
                                <input className={inputCls} value={bankBranch} onChange={e => setBankBranch(e.target.value)} placeholder="e.g. Anna Nagar" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Account Number</label>
                                <input className={inputCls} value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="e.g. 123456789012" />
                            </div>
                            <div>
                                <label className={labelCls}>IFSC Code</label>
                                <input className={inputCls} value={ifscCode} onChange={e => setIfscCode(e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Account Holder Name</label>
                                <input className={inputCls} value={accountHolderName} onChange={e => setAccountHolderName(e.target.value)} placeholder="e.g. Sri Vari Enterprises" />
                            </div>
                            <div>
                                <label className={labelCls}>Account Type</label>
                                <select className={inputCls} value={accountType} onChange={e => setAccountType(e.target.value)}>
                                    <option>Current A/c</option>
                                    <option>Savings A/c</option>
                                    <option>OD Account</option>
                                </select>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={companySaving}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            {companySaving ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving...</> : <><Check size={16} />Save Company & Bank Details</>}
                        </button>
                    </form>
                </div>

                {/* WhatsApp Connection Section */}
                <WhatsAppSection />

                {/* Google Drive Settings */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <HardDrive size={20} className="text-blue-500" />
                        Google Drive
                    </h2>
                    <p className="text-sm text-slate-500 mb-3">
                        Enter your Google email to access invoices saved to Drive.
                    </p>
                    <form onSubmit={handleSaveDriveEmail} className="space-y-4">
                        <div>
                            <label className={labelCls}>Google Email</label>
                            <input
                                type="email"
                                value={driveEmail}
                                onChange={(e) => setDriveEmail(e.target.value)}
                                className={inputCls}
                                placeholder="e.g. yourname@gmail.com"
                            />
                        </div>
                        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">
                            Save Email
                        </button>
                    </form>
                </div>

                {/* Admin Header */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <Settings className="text-emerald-600" size={20} />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-800">Admin Settings</h1>
                        <p className="text-xs text-slate-500">Manage credentials</p>
                    </div>
                </div>

                {/* Message */}
                {message && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                        {message.text}
                    </div>
                )}

                {/* Change Username */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <User size={20} className="text-slate-500" />
                        Change Username
                    </h2>
                    <p className="text-sm text-slate-500 mb-4">
                        Current username: <span className="font-medium text-slate-700">{currentUsername}</span>
                    </p>
                    <form onSubmit={handleUpdateUsername} className="space-y-4">
                        <div>
                            <label className={labelCls}>New Username</label>
                            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className={inputCls} placeholder="Enter new username" />
                        </div>
                        <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">Update Username</button>
                    </form>
                </div>

                {/* Change Password */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Lock size={20} className="text-slate-500" />
                        Change Password
                    </h2>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                        <p className="text-xs text-amber-700"><strong>Requirements:</strong> Min 8 chars, 1 capital, 1 number, 1 special character</p>
                    </div>
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        {[
                            { label: 'Current Password', value: currentPassword, set: setCurrentPassword, show: showCurrentPassword, toggle: () => setShowCurrentPassword(!showCurrentPassword), placeholder: 'Enter current password' },
                            { label: 'New Password', value: newPassword, set: setNewPassword, show: showNewPassword, toggle: () => setShowNewPassword(!showNewPassword), placeholder: 'Enter new password' },
                            { label: 'Confirm New Password', value: confirmPassword, set: setConfirmPassword, show: showConfirmPassword, toggle: () => setShowConfirmPassword(!showConfirmPassword), placeholder: 'Confirm new password' },
                        ].map(({ label, value, set, show, toggle, placeholder }) => (
                            <div key={label}>
                                <label className={labelCls}>{label}</label>
                                <div className="relative">
                                    <input type={show ? 'text' : 'password'} value={value} onChange={(e) => set(e.target.value)} className={`${inputCls} pr-12`} placeholder={placeholder} />
                                    <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        {show ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">Update Password</button>
                    </form>
                </div>

            </div>
        </div>
    );
}
