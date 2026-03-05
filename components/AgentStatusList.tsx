'use client';

import React, { useEffect, useState } from 'react';
import { AgentTrackingData } from '@/types';
import { subscribeToStatusUpdates } from '@/lib/agentTrackingService';
import { MapPin, Phone, Clock, Circle } from 'lucide-react';

interface AgentStatusListProps {
    agentData: AgentTrackingData[];
    onAgentClick?: (agentId: string) => void;
    selectedAgentId?: string | null;
}

export function AgentStatusList({ agentData, onAgentClick, selectedAgentId }: AgentStatusListProps) {
    // Format time ago
    const formatTimeAgo = (date: Date) => {
        const diff = new Date().getTime() - date.getTime();
        const seconds = Math.floor(Math.max(0, diff) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    // Sort: active agents first, then by last active time
    const sortedData = [...agentData].sort((a, b) => {
        const aActive = a.status?.isActive || false;
        const bActive = b.status?.isActive || false;

        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;

        const aTime = a.status?.lastActiveAt?.getTime() || 0;
        const bTime = b.status?.lastActiveAt?.getTime() || 0;
        return bTime - aTime;
    });

    const activeCount = agentData.filter(d => d.status?.isActive).length;
    const inactiveCount = agentData.length - activeCount;

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
                            const hasLocation = (!!data.latestLocation && data.latestLocation.latitude !== 0) ||
                                (data.status?.currentLatitude !== undefined && data.status?.currentLatitude !== null && data.status.currentLatitude !== 0);

                            // Truthful status detection
                            const now = new Date().getTime();
                            const lastActive = data.status?.lastActiveAt?.getTime() || 0;
                            // Use absolute difference or just cap at 0 to handle future timestamps gracefully
                            const diff = Math.max(0, now - lastActive);
                            const isStale = lastActive > 0 && diff > 30 * 60 * 1000;

                            const rawActive = data.status?.isActive || false;
                            const isActive = rawActive && !isStale && hasLocation;

                            let statusLabel = isActive ? 'Active' : 'Inactive';
                            if (rawActive && isStale) statusLabel = 'Stale';
                            else if (rawActive && !hasLocation) statusLabel = 'No GPS';

                            return (
                                <div
                                    key={data.agent.id}
                                    onClick={() => onAgentClick?.(data.agent.id)}
                                    className={`p-4 hover:bg-slate-50 transition-colors ${onAgentClick ? 'cursor-pointer' : ''
                                        } ${selectedAgentId === data.agent.id ? 'bg-emerald-50' : ''}`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            {/* Agent name and status */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <Circle
                                                    size={12}
                                                    className={`${isActive
                                                        ? 'fill-emerald-500 text-emerald-500'
                                                        : rawActive
                                                            ? 'fill-amber-400 text-amber-400'
                                                            : 'fill-slate-400 text-slate-400'
                                                        }`}
                                                />
                                                <h4 className={`font-semibold ${isActive ? 'text-slate-800' : 'text-slate-600'}`}>{data.agent.name}</h4>
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
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <Clock size={14} className="text-slate-500" />
                                                        <span className={isActive ? "text-emerald-600 font-medium" : "text-slate-500"}>
                                                            {isActive ? 'Live' : formatTimeAgo(data.status.lastActiveAt)}
                                                            {isStale && rawActive && <span className="ml-1 text-xs font-normal text-slate-400">(Stale)</span>}
                                                        </span>
                                                    </div>
                                                )}

                                                {isActive && data.status?.currentAddress && (
                                                    <div className="flex flex-col gap-1 mt-1">
                                                        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-100">
                                                            <MapPin size={12} className="mt-0.5 shrink-0" />
                                                            <span className="italic">{data.status.currentAddress}</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 ml-5">
                                                            {data.status.currentLatitude?.toFixed(4)}, {data.status.currentLongitude?.toFixed(4)}
                                                        </div>
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
                                                : rawActive && isStale
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {statusLabel}
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
