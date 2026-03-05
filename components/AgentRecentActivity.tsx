'use client';

import React, { useEffect, useState } from 'react';
import { AgentActivity } from '@/types';
import { getAgentActivityTimeline } from '@/lib/agentTrackingService';
import {
    Clock,
    MapPin,
    Receipt,
    LogIn,
    LogOut,
    AlertCircle,
    Activity
} from 'lucide-react';

interface AgentRecentActivityProps {
    agentId: string;
    agentName: string;
    refreshInterval?: number; // ms
}

export function AgentRecentActivity({ agentId, agentName, refreshInterval = 30000 }: AgentRecentActivityProps) {
    const [activities, setActivities] = useState<AgentActivity[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchActivity = async () => {
        const data = await getAgentActivityTimeline(agentId, agentName);
        setActivities(data);
        setLoading(false);
    };

    useEffect(() => {
        setLoading(true);
        fetchActivity();

        if (refreshInterval > 0) {
            const timer = setInterval(fetchActivity, refreshInterval);
            return () => clearInterval(timer);
        }
    }, [agentId, agentName]);

    const getActivityIcon = (type: AgentActivity['type']) => {
        switch (type) {
            case 'CHECK_IN': return <LogIn className="text-emerald-500" size={16} />;
            case 'CHECK_OUT': return <LogOut className="text-amber-500" size={16} />;
            case 'PAYMENT': return <Receipt className="text-blue-500" size={16} />;
            case 'LOCATION': return <MapPin className="text-slate-400" size={16} />;
            default: return <Activity className="text-slate-400" size={16} />;
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (date: Date) => {
        const now = new Date();
        if (date.toDateString() === now.toDateString()) return 'Today';
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    if (loading && activities.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">Loading activity logs...</p>
            </div>
        );
    }

    if (activities.length === 0) {
        return (
            <div className="text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Clock className="mx-auto mb-2 text-slate-300" size={32} />
                <p className="text-sm text-slate-500">No recent activity recorded</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Activity size={16} />
                    Recent Activity
                </h3>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Live Logs</span>
            </div>

            <div className="relative space-y-3 before:absolute before:inset-0 before:ml-[11px] before:w-[1px] before:bg-slate-200">
                {activities.map((activity, idx) => (
                    <div key={activity.id} className="relative pl-7 group">
                        {/* Dot on the timeline */}
                        <div className="absolute left-0 top-1 w-[22px] h-[22px] rounded-full bg-white border border-slate-200 flex items-center justify-center z-10">
                            {getActivityIcon(activity.type)}
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm group-hover:border-emerald-100 transition-colors">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-semibold text-slate-800">
                                    {activity.type === 'PAYMENT' ? 'Receipt Recorded' :
                                        activity.type === 'CHECK_IN' ? 'Started Shift' :
                                            activity.type === 'CHECK_OUT' ? 'Ended Shift' :
                                                activity.type === 'LOCATION' ? 'Location Update' : 'Activity'}
                                </span>
                                <div className="text-[10px] font-medium text-slate-400 flex flex-col items-end">
                                    <span>{formatDate(activity.timestamp)}</span>
                                    <span>{formatTime(activity.timestamp)}</span>
                                </div>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                {activity.description}
                            </p>

                            {activity.type === 'PAYMENT' && (
                                <div className="mt-2 text-[10px] flex items-center gap-3 text-slate-400">
                                    <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">#{activity.metadata.ref}</span>
                                    <span className="bg-slate-50 px-1.5 py-0.5 rounded">Source: {activity.metadata.source || 'MOBILE'}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
