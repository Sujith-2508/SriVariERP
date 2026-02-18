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
                ? { latitude: selectedData.status.currentLatitude as number, longitude: selectedData.status.currentLongitude as number }
                : null;
            const loc = latestLoc || statusLoc;

            if (loc && loc.latitude !== 0 && loc.longitude !== 0) {
                map.setView(
                    [loc.latitude, loc.longitude],
                    16,
                    { animate: true }
                );
            }
        } else if (trackingData.length > 0) {
            const locations = trackingData
                .map(d => {
                    const latestLoc = d.latestLocation;
                    const statusLoc = (d.status?.currentLatitude !== undefined && d.status?.currentLatitude !== null) && (d.status?.currentLongitude !== undefined && d.status?.currentLongitude !== null)
                        ? {
                            latitude: d.status.currentLatitude,
                            longitude: d.status.currentLongitude,
                            address: d.status.currentAddress
                        }
                        : null;
                    return latestLoc || statusLoc;
                })
                .filter((loc): loc is NonNullable<typeof loc> => !!loc && loc.latitude !== 0 && loc.longitude !== 0)
                .map(loc => [loc.latitude, loc.longitude] as [number, number]);

            if (locations.length > 0) {
                const bounds = L.latLngBounds(locations);
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50] });
                }
            }
        }
    }, [map, trackingData, selectedAgent]);

    return null;
}

export function LiveMap({ agentData }: LiveMapProps) {
    const [trackingData, setTrackingData] = useState<AgentTrackingData[]>(agentData);
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
    const [routeHistory, setRouteHistory] = useState<AgentLocation[]>([]);
    const [showRoute, setShowRoute] = useState(false);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Update tracking data when props change
    useEffect(() => {
        setTrackingData(agentData);
    }, [agentData]);

    // Subscribe to real-time updates
    useEffect(() => {
        const statusSubscription = subscribeToStatusUpdates((status) => {
            setTrackingData(prev => prev.map(data =>
                data.agent.id === status.agentId
                    ? { ...data, status }
                    : data
            ));
        });

        const locationSubscription = subscribeToLocationUpdates((location) => {
            setTrackingData(prev => prev.map(data =>
                data.agent.id === location.agentId
                    ? { ...data, latestLocation: location }
                    : data
            ));

            if (selectedAgent === location.agentId) {
                setRouteHistory(prev => [...prev, location]);
            }
        });

        return () => {
            statusSubscription.unsubscribe();
            locationSubscription.unsubscribe();
        };
    }, [selectedAgent]);

    // Load route history when agent is selected
    useEffect(() => {
        if (selectedAgent && showRoute) {
            getAgentRoute(selectedAgent, new Date()).then(route => {
                setRouteHistory(route);
            });
        }
    }, [selectedAgent, showRoute]);

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
            <div className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-lg p-2 flex flex-col gap-2">
                <button
                    onClick={() => setShowRoute(!showRoute)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showRoute
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    title={showRoute ? 'Hide Route' : 'Show Route'}
                >
                    <Navigation size={16} />
                    <span>Route</span>
                </button>
                {selectedAgent && (
                    <button
                        onClick={() => { setSelectedAgent(null); setShowRoute(false); }}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                        title="Reset View"
                    >
                        <Maximize size={16} />
                        <span>Reset</span>
                    </button>
                )}
            </div>

            <MapContainer
                center={[20.5937, 78.9629]}
                zoom={5}
                style={{ height: '100%', width: '100%', zIndex: 1 }}
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapController trackingData={trackingData} selectedAgent={selectedAgent} />

                {trackingData.map(data => {
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

                    const isActive = data.status?.isActive || false;
                    const position: [number, number] = [effectiveLoc.latitude, effectiveLoc.longitude];

                    return (
                        <Marker
                            key={data.agent.id}
                            position={position}
                            icon={isActive ? GreenIcon : RedIcon}
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
                const data = trackingData.find(d => d.agent.id === selectedAgent);
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
