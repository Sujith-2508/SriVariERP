'use client';

import React, { useEffect, useState } from 'react';
import { AgentTrackingData } from '@/types';
import { subscribeToStatusUpdates } from '@/lib/agentTrackingService';
import { MapPin, Phone, Clock, Circle } from 'lucide-react';

interface AgentStatusListProps {
    agentData: AgentTrackingData[];
    onAgentClick?: (agentId: string) => void;
}

export function AgentStatusList({ agentData, onAgentClick }: AgentStatusListProps) {
    const [trackingData, setTrackingData] = useState<AgentTrackingData[]>(agentData);

    // Update tracking data when props change
    useEffect(() => {
        setTrackingData(agentData);
    }, [agentData]);

    // Subscribe to real-time status updates
    useEffect(() => {
        const subscription = subscribeToStatusUpdates((status) => {
            setTrackingData(prev => prev.map(data =>
                data.agent.id === status.agentId
                    ? { ...data, status }
                    : data
            ));
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Format time ago
    const formatTimeAgo = (date: Date) => {
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    // Sort: active agents first, then by last active time
    const sortedData = [...trackingData].sort((a, b) => {
        const aActive = a.status?.isActive || false;
        const bActive = b.status?.isActive || false;

        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;

        const aTime = a.status?.lastActiveAt?.getTime() || 0;
        const bTime = b.status?.lastActiveAt?.getTime() || 0;
        return bTime - aTime;
    });

    const activeCount = trackingData.filter(d => d.status?.isActive).length;
    const inactiveCount = trackingData.length - activeCount;

    return (
        <div className="h-full flex flex-col">
            {/* Header with stats */}
            <div className="bg-white border-b border-slate-200 p-4">
                <h3 className="text-lg font-bold text-slate-800 mb-3">Agent Status</h3>
                <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="text-sm text-slate-600">
                            Active: <span className="font-semibold text-slate-800">{activeCount}</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-slate-400" />
                        <span className="text-sm text-slate-600">
                            Inactive: <span className="font-semibold text-slate-800">{inactiveCount}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Agent list */}
            <div className="flex-1 overflow-y-auto">
                {sortedData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        <div className="text-center">
                            <MapPin size={48} className="mx-auto mb-2 opacity-50" />
                            <p>No agents found</p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {sortedData.map(data => {
                            const isActive = data.status?.isActive || false;
                            const hasLocation = !!data.latestLocation;

                            return (
                                <div
                                    key={data.agent.id}
                                    onClick={() => onAgentClick?.(data.agent.id)}
                                    className={`p-4 hover:bg-slate-50 transition-colors ${onAgentClick ? 'cursor-pointer' : ''
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            {/* Agent name and status */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <Circle
                                                    size={12}
                                                    className={`${isActive
                                                            ? 'fill-emerald-500 text-emerald-500'
                                                            : 'fill-slate-400 text-slate-400'
                                                        }`}
                                                />
                                                <h4 className="font-semibold text-slate-800">{data.agent.name}</h4>
                                            </div>

                                            {/* Agent details */}
                                            <div className="space-y-1 ml-5">
                                                {data.agent.division && (
                                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                                        <MapPin size={14} />
                                                        <span>{data.agent.division}</span>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Phone size={14} />
                                                    <span>{data.agent.phone}</span>
                                                </div>

                                                {data.status?.lastActiveAt && (
                                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                                        <Clock size={14} />
                                                        <span>{formatTimeAgo(data.status.lastActiveAt)}</span>
                                                    </div>
                                                )}

                                                {/* Location indicator */}
                                                {hasLocation && (
                                                    <div className="text-xs text-emerald-600 font-medium">
                                                        📍 Location available
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Status badge */}
                                        <div>
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${isActive
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Today's attendance */}
                                    {data.todayAttendance && (
                                        <div className="mt-3 ml-5 p-2 bg-blue-50 rounded-lg">
                                            <div className="text-xs text-blue-700">
                                                <span className="font-medium">Today: </span>
                                                {data.todayAttendance.checkInTime && (
                                                    <span>
                                                        In: {new Date(data.todayAttendance.checkInTime).toLocaleTimeString('en-US', {
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                )}
                                                {data.todayAttendance.checkOutTime && (
                                                    <span className="ml-2">
                                                        Out: {new Date(data.todayAttendance.checkOutTime).toLocaleTimeString('en-US', {
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                )}
                                                {data.todayAttendance.totalHours && (
                                                    <span className="ml-2 font-semibold">
                                                        ({data.todayAttendance.totalHours.toFixed(1)}h)
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
