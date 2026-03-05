'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AgentTrackingData, AgentLocation } from '@/types';
import { getAgentRoute, subscribeToLocationUpdates, subscribeToStatusUpdates } from '@/lib/agentTrackingService';
import { MapPin, Navigation, Clock, Maximize } from 'lucide-react';

// Fix for default marker icons in Next.js/Electron
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

const GreenIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const RedIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface LiveMapProps {
    agentData: AgentTrackingData[];
    selectedAgentId?: string | null;
    onAgentClick?: (agentId: string | null) => void;
}

// Helper component to handle map centering, zooming, and resizing
function MapController({ trackingData, selectedAgent }: { trackingData: AgentTrackingData[], selectedAgent: string | null }) {
    const map = useMap();

    // Fix for Leaflet rendering issues in Electron/Next.js
    useEffect(() => {
        if (!map) return;

        // Manual invalidation after a short delay
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 800);

        // Continuous observer to handle any dynamic layout shifts
        const container = map.getContainer();
        const observer = new ResizeObserver(() => {
            map.invalidateSize({ animate: false });
        });

        observer.observe(container);

        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [map]);

    useEffect(() => {
        if (selectedAgent) {
            const selectedData = trackingData.find(d => d.agent.id === selectedAgent);
            const latestLoc = selectedData?.latestLocation;
            const statusLoc = (selectedData?.status?.currentLatitude !== undefined && selectedData?.status?.currentLatitude !== null) &&
                (selectedData?.status?.currentLongitude !== undefined && selectedData?.status?.currentLongitude !== null)
                ? { latitude: (selectedData.status.currentLatitude as number), longitude: (selectedData.status.currentLongitude as number) }
                : null;
            const loc = latestLoc || statusLoc;

            if (loc && loc.latitude !== 0 && loc.longitude !== 0) {
                map.setView(
                    [loc.latitude, loc.longitude],
                    16,
                    { animate: true }
                );
            }
        } else {
            // "Show All" mode
            const locations = trackingData
                .map(d => {
                    const latestLoc = d.latestLocation;
                    const statusLoc = (d.status?.currentLatitude !== undefined && d.status?.currentLatitude !== null) && (d.status?.currentLongitude !== undefined && d.status?.currentLongitude !== null)
                        ? {
                            latitude: d.status.currentLatitude,
                            longitude: d.status.currentLongitude
                        }
                        : null;
                    return latestLoc || statusLoc;
                })
                .filter((loc): loc is NonNullable<typeof loc> => !!loc && loc.latitude !== 0 && loc.longitude !== 0)
                .map(loc => [loc.latitude, loc.longitude] as [number, number]);

            if (locations.length > 0) {
                const bounds = L.latLngBounds(locations);
                if (bounds.isValid()) {
                    // Use a lower maxZoom (e.g., 9) for "Show All" mode to keep it regional
                    map.fitBounds(bounds, {
                        padding: [80, 80],
                        maxZoom: 9,
                        animate: true
                    });
                }
            } else {
                // Default view of Coimbatore/Regional area if no agents have locations
                map.setView([10.6620, 77.0065], 9);
            }
        }
    }, [map, trackingData, selectedAgent]);

    return null;
}

export function LiveMap({ agentData, selectedAgentId, onAgentClick }: LiveMapProps) {
    const [internalSelectedAgent, setInternalSelectedAgent] = useState<string | null>(null);

    // Use prop if provided, otherwise fallback to internal state
    const selectedAgent = selectedAgentId !== undefined ? selectedAgentId : internalSelectedAgent;
    const setSelectedAgent = (id: string | null) => {
        if (onAgentClick) {
            onAgentClick(id);
        } else {
            setInternalSelectedAgent(id);
        }
    };
    const [routeHistory, setRouteHistory] = useState<AgentLocation[]>([]);
    const [showRoute, setShowRoute] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Load route history when agent is selected or date changes
    useEffect(() => {
        if (selectedAgent && showRoute) {
            getAgentRoute(selectedAgent, new Date(selectedDate)).then(route => {
                setRouteHistory(route);
            });
        } else if (!selectedAgent) {
            setRouteHistory([]);
        }
    }, [selectedAgent, showRoute, selectedDate]);

    // Live path update: Append new location to history if it belongs to selected agent
    useEffect(() => {
        if (!selectedAgent || !showRoute) return;

        const today = new Date().toISOString().split('T')[0];
        if (selectedDate !== today) return;

        const data = agentData.find(d => d.agent.id === selectedAgent);
        const loc = data?.latestLocation;

        if (loc) {
            setRouteHistory(prev => {
                const last = prev[prev.length - 1];
                if (!last || last.recordedAt.getTime() !== loc.recordedAt.getTime()) {
                    return [...prev, loc];
                }
                return prev;
            });
        }
    }, [agentData, selectedAgent, showRoute, selectedDate]);

    const handleAgentClick = (agentId: string) => {
        setSelectedAgent(agentId);
        setShowRoute(true);
    };

    // Format time ago
    const formatTimeAgo = (date: Date) => {
        const diff = new Date().getTime() - date.getTime();
        const seconds = Math.floor(Math.max(0, diff) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    };

    if (!isClient) {
        return <div className="h-full w-full bg-slate-50 animate-pulse" />;
    }

    return (
        <div className="relative h-full w-full overflow-hidden">
            <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
                <div className="bg-white rounded-lg shadow-lg p-2 flex flex-col gap-2">
                    <div className="flex flex-col gap-1 px-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">View Path For</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="text-xs border border-slate-200 rounded p-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                    </div>

                    <button
                        onClick={() => setShowRoute(!showRoute)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showRoute
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        title={showRoute ? 'Hide Route' : 'Show Route'}
                    >
                        <Navigation size={16} />
                        <span>{showRoute ? 'Hide Path' : 'Show Path'}</span>
                    </button>

                    <button
                        onClick={() => { setSelectedAgent(null); setShowRoute(false); }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${!selectedAgent
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        title="Show all agents"
                        disabled={!selectedAgent}
                    >
                        <Maximize size={16} />
                        <span>Show All</span>
                    </button>
                </div>
            </div>

            <MapContainer
                center={[10.6620, 77.0065]}
                zoom={9}
                style={{ height: '100%', width: '100%', zIndex: 1 }}
                zoomControl={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapController trackingData={agentData} selectedAgent={selectedAgent} />

                {agentData.map(data => {
                    const latestLoc = data.latestLocation;
                    const statusLoc = (data.status?.currentLatitude !== undefined && data.status?.currentLatitude !== null) && (data.status?.currentLongitude !== undefined && data.status?.currentLongitude !== null)
                        ? {
                            latitude: data.status.currentLatitude,
                            longitude: data.status.currentLongitude,
                            address: data.status.currentAddress
                        }
                        : null;

                    const effectiveLoc = latestLoc || statusLoc;
                    const isValidLocation = effectiveLoc && effectiveLoc.latitude !== 0 && effectiveLoc.longitude !== 0;

                    if (!isValidLocation) return null;

                    // Truthful isActive for marker color
                    const now = new Date().getTime();
                    const lastActive = data.status?.lastActiveAt?.getTime() || 0;
                    const diff = Math.max(0, now - lastActive);
                    const isStale = lastActive > 0 && diff > 30 * 60 * 1000;

                    const rawActive = data.status?.isActive || false;
                    const isActive = rawActive && !isStale && isValidLocation;

                    const position: [number, number] = [effectiveLoc.latitude, effectiveLoc.longitude];

                    // Determine marker icon based on detailed status
                    let markerIcon = RedIcon;
                    if (isActive) {
                        markerIcon = GreenIcon;
                    } else if (rawActive) {
                        markerIcon = DefaultIcon; // Default blue icon for active but stale or No GPS
                    }

                    return (
                        <Marker
                            key={data.agent.id}
                            position={position}
                            icon={markerIcon}
                            eventHandlers={{
                                click: () => handleAgentClick(data.agent.id),
                            }}
                        >
                            <Popup>
                                <div className="p-1">
                                    <h3 className="font-bold text-slate-800">{data.agent.name}</h3>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {isActive ? 'Active' : 'Inactive'} • {data.agent.area || 'No Area'}
                                    </p>
                                    {effectiveLoc.address && (
                                        <p className="text-xs text-slate-600 mt-1 font-medium border-t border-slate-100 pt-1">
                                            📍 {effectiveLoc.address}
                                        </p>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

                {showRoute && routeHistory.length > 1 && (
                    <Polyline
                        positions={routeHistory.map(loc => [loc.latitude, loc.longitude] as [number, number])}
                        pathOptions={{
                            color: "#3b82f6",
                            weight: 4,
                            opacity: 0.8
                        }}
                    />
                )}
            </MapContainer>

            {/* Custom Info Overlay for Selected Agent */}
            {selectedAgent && (() => {
                const data = agentData.find(d => d.agent.id === selectedAgent);
                if (!data) return null;
                const isActive = data.status?.isActive || false;

                return (
                    <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow-lg p-4 min-w-[250px]">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-slate-800 text-lg">{data.agent.name}</h3>
                            <div className={`px-2 py-1 rounded text-xs font-medium ${isActive
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                                }`}>
                                {isActive ? 'Active' : 'Inactive'}
                            </div>
                        </div>

                        <div className="space-y-2 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                                <MapPin size={16} className="text-slate-400" />
                                <span>{data.agent.division || data.agent.area || 'N/A'}</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <Clock size={16} className="text-slate-400" />
                                <span>
                                    {data.status?.lastActiveAt
                                        ? formatTimeAgo(data.status.lastActiveAt)
                                        : 'No recent activity'}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
