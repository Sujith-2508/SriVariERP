'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Phone, CheckCircle, AlertCircle, Loader2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleResetRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Find user
            const { data: user, error: queryError } = await supabase
                .from('users')
                .select('id, username, email, phone_number')
                .eq('username', username.trim())
                .eq('is_active', true)
                .single();

            if (queryError || !user) {
                setError('User not found. Please check your username.');
                setIsLoading(false);
                return;
            }

            // AUTOMATED RECOVERY: Trigger both Email and SMS
            console.log(`[RECOVERY] Triggering automated recovery for user: ${user.username}`);

            if (user.email) {
                console.log(`[EMAIL] Sending reset link to: ${user.email}`);
                // In production, this would call an API route to send transactional email
            }

            if (user.phone_number) {
                console.log(`[SMS] Sending reset code to: ${user.phone_number}`);
                // In production, this would call an SMS provider service (e.g., Twilio, AWS SNS)
            }

            setSuccess(true);
        } catch (err) {
            console.error('Password reset error:', err);
            setError('An error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/10 max-w-md w-full text-center">
                    <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Instructions Sent</h2>
                    <p className="text-slate-300 mb-6 font-medium">
                        Recovery instructions have been sent automatically to your registered **Email** and **Mobile Number**.
                    </p>
                    <div className="space-y-3 mb-8">
                        <div className="flex items-center gap-3 text-emerald-300 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-sm">
                            <Mail size={18} />
                            <span>Check your official Email inbox</span>
                        </div>
                        <div className="flex items-center gap-3 text-emerald-300 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-sm">
                            <Phone size={18} />
                            <span>Check for an SMS on your phone</span>
                        </div>
                    </div>
                    <button
                        onClick={() => router.push('/login')}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-600/30"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
            <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0" style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
                    backgroundSize: '40px 40px'
                }}></div>
            </div>

            <div className="relative z-10 w-full max-w-md">
                <button
                    onClick={() => router.push('/login')}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
                >
                    <ArrowLeft size={20} />
                    Back to Login
                </button>

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-white uppercase tracking-wider">Password Recovery</h1>
                    <p className="text-slate-400 text-sm mt-1">Enter your username to receive reset instructions</p>
                </div>

                <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/10">
                    <form onSubmit={handleResetRequest} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                                placeholder="Enter your username"
                                required
                            />
                        </div>

                        <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl">
                            <h4 className="text-emerald-400 text-xs font-bold uppercase mb-2">Automated Method</h4>
                            <p className="text-slate-400 text-[11px] leading-relaxed">
                                Once you submit your username, the system will instantly send instructions to both your **registered Gmail and Mobile Number (via SMS)**.
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <>
                                    <span>Send Recovery Info</span>
                                    <Send size={18} />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
