'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmationContext';
import { Agent } from '@/types';
import { UserPlus, Edit2, Trash2, Users, Target, MapPin, Phone, X, Check, TrendingUp, Navigation2, Calendar, DollarSign, Receipt, Activity } from 'lucide-react';
import { LiveMap } from '@/components/LiveMap';
import { AgentStatusList } from '@/components/AgentStatusList';
import { AttendanceCalendar } from '@/components/AttendanceCalendar';
import AgentSalaryManagement from '@/components/AgentSalaryManagement';
import CompanyExpenseManagement from '@/components/CompanyExpenseManagement';
import { ProfitAnalysis } from '@/components/ProfitAnalysis';
import { AgentRecentActivity } from '@/components/AgentRecentActivity';

type TabType = 'overview' | 'tracking' | 'attendance' | 'salary' | 'expenses' | 'analysis';

export default function AgentsPage() {
    const { agents, transactions, addAgent, updateAgent, deleteAgent, isLoading, trackingData, loadingTracking, refreshData } = useData();
    const { showToast } = useToast();
    const { showConfirm } = useConfirm();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    // Handle tab change from query params (e.g. from Sidebar)
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'overview') {
            setActiveTab('overview');
        }
    }, [searchParams]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        division: '',
        collectionTarget: 100000,
        monthlySalary: '' as number | '',
        isActive: true,
        agentId: '',
        password: '',
    });

    // Calculate current month collections for each agent
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // Filter for active agents for Overview and Tracking tabs
    const activeAgents = agents.filter(a => a.isActive);
    const activeTrackingData = trackingData.filter(d => d.agent.isActive);

    const getAgentCollections = (agentName: string) => {
        return transactions
            .filter(t => {
                const txnDate = new Date(t.date);
                return t.type === 'PAYMENT' &&
                    t.agentName === agentName &&
                    txnDate.getMonth() === currentMonth &&
                    txnDate.getFullYear() === currentYear;
            })
            .reduce((acc, t) => acc + t.amount, 0);
    };

    const handleRefresh = async () => {
        await refreshData();
    };

    // Set first agent as selected when switching to attendance/salary tabs
    useEffect(() => {
        if ((activeTab === 'attendance' || activeTab === 'salary') && agents.length > 0 && !selectedAgent) {
            setSelectedAgent(agents[0]);
        }
    }, [activeTab, agents]);

    const resetForm = () => {
        setFormData({
            name: '',
            phone: '',
            division: '',
            collectionTarget: 100000,
            monthlySalary: '' as number | '',
            isActive: true,
            agentId: '',
            password: '',
        });
        setEditingAgent(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate phone number is exactly 10 digits
        if (!/^\d{10}$/.test(formData.phone)) {
            showToast('Phone number must be exactly 10 digits', 'warning');
            return;
        }

        try {
            if (editingAgent) {
                // Check if agentId is being changed and if it already exists elsewhere
                if (formData.agentId !== editingAgent.agentId) {
                    const idExists = agents.some(a => a.agentId === formData.agentId && a.id !== editingAgent.id);
                    if (idExists) {
                        showToast(`Agent ID "${formData.agentId}" already exists.`, 'warning');
                        return;
                    }
                }

                await updateAgent({
                    ...editingAgent,
                    name: formData.name,
                    phone: formData.phone,
                    division: formData.division,
                    area: formData.division,
                    collectionTarget: formData.collectionTarget,
                    monthlySalary: formData.monthlySalary === '' ? 0 : Number(formData.monthlySalary),
                    isActive: formData.isActive,
                    agentId: formData.agentId,
                    password: formData.password || undefined,
                });
                showToast('Agent updated successfully', 'success');
            } else {
                if (!formData.agentId || !formData.password) {
                    showToast('Agent ID and Password are required for new agents.', 'warning');
                    return;
                }

                // Pre-submission check for duplicate Agent ID
                const idExists = agents.some(a => a.agentId === formData.agentId);
                if (idExists) {
                    showToast(`Agent ID "${formData.agentId}" already exists in the system.`, 'warning');
                    return;
                }

                await addAgent({
                    name: formData.name,
                    phone: formData.phone,
                    division: formData.division,
                    area: formData.division,
                    collectionTarget: formData.collectionTarget,
                    monthlySalary: formData.monthlySalary === '' ? 0 : Number(formData.monthlySalary),
                    isActive: true,
                    agentId: formData.agentId,
                    password: formData.password,
                });
                showToast('Agent added successfully', 'success');
            }
            setShowAddModal(false);
            resetForm();
        } catch (error: any) {
            console.error('Error saving agent:', error);
            const message = error.message || 'Failed to save agent. Please try again.';
            showToast(message, 'error');
        }
    };

    const handleEdit = (agent: Agent) => {
        setFormData({
            name: agent.name,
            phone: agent.phone,
            division: agent.division || agent.area || '',
            collectionTarget: agent.collectionTarget || 100000,
            monthlySalary: agent.monthlySalary || ('' as number | ''),
            isActive: agent.isActive,
            agentId: agent.agentId || '',
            password: '',
        });
        setEditingAgent(agent);
        setShowAddModal(true);
    };

    const handleDelete = async (id: string) => {
        const confirmed = await showConfirm({
            title: 'Delete Agent',
            message: 'Are you sure you want to delete this agent? This action cannot be undone.',
            confirmLabel: 'Delete',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await deleteAgent(id);
                showToast('Agent deleted successfully', 'success');
            } catch (error) {
                console.error('Error deleting agent:', error);
                showToast('Failed to delete agent. Please try again.', 'error');
            }
        }
    };

    const tabs = [
        { id: 'overview' as TabType, label: 'Overview', icon: Users },
        { id: 'tracking' as TabType, label: 'Live Tracking', icon: Navigation2 },
        // { id: 'history' as TabType, label: 'History', icon: MapPin }, // Removed per user request
        { id: 'attendance' as TabType, label: 'Attendance', icon: Calendar },
        { id: 'salary' as TabType, label: 'Salary', icon: DollarSign },
        { id: 'expenses' as TabType, label: 'Expenses', icon: Receipt },
        { id: 'analysis' as TabType, label: 'Analysis', icon: TrendingUp },
    ];

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Collection Agents & Expenses</h1>
                        <p className="text-sm text-slate-500">Manage agents, track locations, monitor attendance, and company expenses</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleRefresh()}
                            className={`p-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2 ${isLoading || loadingTracking ? 'animate-pulse cursor-wait' : ''}`}
                            title="Refresh Data"
                            disabled={isLoading || loadingTracking}
                        >
                            <Navigation2 size={18} className={isLoading || loadingTracking ? 'animate-spin' : ''} />
                            <span className="font-medium text-sm">Refresh</span>
                        </button>
                        {activeTab !== 'expenses' && activeTab !== 'analysis' && (
                            <button
                                onClick={() => { resetForm(); setShowAddModal(true); }}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
                            >
                                <UserPlus size={18} />
                                Add Agent
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-slate-200 -mb-px">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 ${activeTab === tab.id
                                    ? 'border-emerald-600 text-emerald-600'
                                    : 'border-transparent text-slate-600 hover:text-slate-800'
                                    }`}
                            >
                                <Icon size={18} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
                {/* Overview Tab (Dashboard) */}
                {activeTab === 'overview' && (
                    <div className="h-full flex flex-col md:flex-row gap-6 p-6 overflow-hidden">
                        {/* Agents Table List */}
                        <div className={`flex-1 overflow-y-auto min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200 transition-all ${selectedAgent ? 'md:w-3/5' : 'w-full'}`}>
                            {/* Stats Header for Overview */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-b border-slate-100 divide-x divide-slate-100">
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                                            <Users size={18} />
                                        </div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Agents</p>
                                    </div>
                                    <p className="text-2xl font-black text-slate-800">{agents.length}</p>
                                </div>
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                            <Target size={18} />
                                        </div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Target</p>
                                    </div>
                                    <p className="text-2xl font-black text-slate-800">₹{(activeAgents.reduce((acc, a) => acc + (a.collectionTarget || 100000), 0) / 100000).toFixed(1)}L</p>
                                </div>
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                            <TrendingUp size={18} />
                                        </div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Collected</p>
                                    </div>
                                    <p className="text-2xl font-black text-slate-800">₹{(activeAgents.reduce((acc, a) => acc + getAgentCollections(a.name), 0) / 1000).toFixed(1)}K</p>
                                </div>
                            </div>

                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">Performance Table</h2>
                                    <p className="text-xs text-slate-500 font-medium">Click an agent to view live activity logs</p>
                                </div>
                            </div>

                            <table className="w-full text-left">
                                <thead className="bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-[50px] z-10">
                                    <tr>
                                        <th className="px-6 py-4">Agent Details</th>
                                        <th className="px-6 py-4">Target (%)</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-20 text-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                                    <p className="text-slate-500 font-medium">Fetching agent data...</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : agents.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-20 text-center text-slate-400">
                                                <Users size={48} className="mx-auto mb-3 opacity-20" />
                                                <p className="text-lg font-medium">No agents added yet</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        agents.map(agent => {
                                            const collections = getAgentCollections(agent.name);
                                            const percent = Math.min(100, Math.round((collections / (agent.collectionTarget || 100000)) * 100));
                                            const displayPercent = isNaN(percent) ? 0 : percent;

                                            return (
                                                <tr
                                                    key={agent.id}
                                                    onClick={() => setSelectedAgent(agent)}
                                                    className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selectedAgent?.id === agent.id ? 'bg-emerald-50/50' : ''}`}
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors">
                                                                {agent.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-slate-800">{agent.name}</div>
                                                                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">
                                                                    {agent.division || 'General'} • {agent.phone}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="max-w-[120px]">
                                                            <div className="flex justify-between text-[10px] mb-1 font-bold">
                                                                <span className="text-emerald-600">₹{(collections / 1000).toFixed(1)}k</span>
                                                                <span className="text-slate-400">{displayPercent}%</span>
                                                            </div>
                                                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-1000 ${displayPercent >= 100 ? 'bg-emerald-500' : 'bg-emerald-400'
                                                                        }`}
                                                                    style={{ width: `${displayPercent}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase border ${agent.isActive
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                            : 'bg-slate-50 text-slate-500 border-slate-100'
                                                            }`}>
                                                            {agent.isActive ? 'ACTIVE' : 'OFF'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button
                                                                onClick={() => handleEdit(agent)}
                                                                className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(agent.id)}
                                                                className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Recent Activity Live Panel */}
                        {selectedAgent && (
                            <div className="w-full md:w-2/5 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-emerald-100">
                                            {selectedAgent.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold text-slate-800">{selectedAgent.name}</h2>
                                            <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Live Dashboard</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedAgent(null)}
                                        className="p-2 hover:bg-slate-200 text-slate-400 rounded-xl transition-all"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6">
                                    <div className="grid grid-cols-2 gap-4 mb-8">
                                        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                                            <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Total Collected</p>
                                            <p className="text-2xl font-black text-emerald-800">₹{getAgentCollections(selectedAgent.name).toLocaleString()}</p>
                                        </div>
                                        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                                            <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Receipts</p>
                                            <p className="text-2xl font-black text-blue-800">
                                                {transactions.filter(t => t.agentName === selectedAgent.name && t.type === 'PAYMENT').length}
                                            </p>
                                        </div>
                                    </div>

                                    <AgentRecentActivity agentId={selectedAgent.id} agentName={selectedAgent.name} />
                                </div>

                                <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                                    <button
                                        onClick={() => setActiveTab('attendance')}
                                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center justify-center gap-2 mx-auto"
                                    >
                                        <Calendar size={14} />
                                        VIEW ATTENDANCE HISTORY
                                    </button>
                                </div>
                            </div>
                        )}

                        {!selectedAgent && (
                            <div className="hidden md:flex flex-1 items-center justify-center flex-col text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                <Activity size={64} className="mb-4 opacity-10" />
                                <h3 className="text-lg font-bold text-slate-300">Live Agent Dashboard</h3>
                                <p className="text-sm">Click any agent in the performance table to see their real-time activity trail</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Live Tracking Tab - Always mounted but hidden if not active to allow map preloading */}
                <div className={`h-full flex ${activeTab === 'tracking' ? '' : 'hidden'}`}>
                    <div className="flex-1 relative">
                        {loadingTracking && trackingData.length === 0 && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                                <div className="text-center">
                                    <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                                    <p className="text-slate-500">Loading tracking data...</p>
                                </div>
                            </div>
                        )}
                        <LiveMap
                            agentData={activeTrackingData}
                            selectedAgentId={selectedAgent?.id}
                            onAgentClick={(id) => {
                                if (id) {
                                    const agent = agents.find(a => a.id === id);
                                    if (agent) setSelectedAgent(agent);
                                } else {
                                    setSelectedAgent(null);
                                }
                            }}
                        />
                    </div>
                    <div className="w-80 border-l border-slate-200">
                        <AgentStatusList
                            agentData={activeTrackingData}
                            selectedAgentId={selectedAgent?.id}
                            onAgentClick={(id) => {
                                // Find the agent object to set it as selected
                                const agent = agents.find(a => a.id === id);
                                if (agent) setSelectedAgent(agent);
                            }}
                        />
                    </div>
                </div>



                {/* Attendance Tab */}
                {activeTab === 'attendance' && (
                    <div className="h-full flex">
                        <div className="w-64 border-r border-slate-200 bg-white overflow-y-auto">
                            <div className="p-4 border-b border-slate-200">
                                <h3 className="font-semibold text-slate-800">Select Agent</h3>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {agents.map(agent => (
                                    <button
                                        key={agent.id}
                                        onClick={() => setSelectedAgent(agent)}
                                        className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selectedAgent?.id === agent.id ? 'bg-emerald-50' : ''
                                            }`}
                                    >
                                        <div className="font-medium text-slate-800">{agent.name}</div>
                                        <div className="text-xs text-slate-500">{agent.division || agent.area}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1">
                            {selectedAgent ? (
                                <AttendanceCalendar agent={selectedAgent} />
                            ) : (
                                <div className="flex items-center justify-center h-full text-slate-400">
                                    <div className="text-center">
                                        <Calendar size={48} className="mx-auto mb-3 opacity-50" />
                                        <p>Select an agent to view attendance</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Salary Tab */}
                {activeTab === 'salary' && (
                    <div className="h-full p-6 overflow-y-auto">
                        <AgentSalaryManagement agents={agents} />
                    </div>
                )}

                {/* Expenses Tab */}
                {activeTab === 'expenses' && (
                    <div className="h-full p-6 overflow-y-auto">
                        <CompanyExpenseManagement />
                    </div>
                )}

                {/* Analysis Tab */}
                {activeTab === 'analysis' && (
                    <div className="h-full">
                        <ProfitAnalysis />
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingAgent ? 'Edit Agent' : 'Add New Agent'}
                            </h2>
                            <button
                                onClick={() => { setShowAddModal(false); resetForm(); }}
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Agent Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Enter agent name"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Agent ID *</label>
                                    <input
                                        type="text"
                                        value={formData.agentId}
                                        onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        placeholder="e.g., AGT001"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">
                                        {editingAgent ? 'New Password' : 'Password *'}
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        placeholder={editingAgent ? "Leave blank to keep" : "Enter password"}
                                        required={!editingAgent}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Phone Number *</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => {
                                        // Only allow digits and limit to 10 characters
                                        const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                                        setFormData({ ...formData, phone: value });
                                    }}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="10-digit phone number"
                                    pattern="[0-9]{10}"
                                    maxLength={10}
                                    minLength={10}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Division / Zone *</label>
                                <input
                                    type="text"
                                    value={formData.division}
                                    onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="e.g., North Zone, South District"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Collection Target (₹)</label>
                                    <input
                                        type="number"
                                        value={formData.collectionTarget}
                                        onChange={(e) => setFormData({ ...formData, collectionTarget: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        placeholder="100000"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Monthly Salary (₹)</label>
                                    <input
                                        type="number"
                                        value={formData.monthlySalary}
                                        onChange={(e) => setFormData({ ...formData, monthlySalary: e.target.value === '' ? '' : Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        placeholder="0"
                                        min="0"
                                    />
                                </div>
                            </div>



                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowAddModal(false); resetForm(); }}
                                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Check size={18} />
                                    {editingAgent ? 'Update' : 'Add Agent'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
