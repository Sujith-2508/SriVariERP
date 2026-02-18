'use client';

import React, { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { Agent } from '@/types';
import { UserPlus, Edit2, Trash2, Users, Target, MapPin, Phone, X, Check, TrendingUp, Navigation2, Calendar, DollarSign, Receipt } from 'lucide-react';
import { LiveMap } from '@/components/LiveMap';
import { AgentStatusList } from '@/components/AgentStatusList';
import { AttendanceCalendar } from '@/components/AttendanceCalendar';
import AgentSalaryManagement from '@/components/AgentSalaryManagement';
import CompanyExpenseManagement from '@/components/CompanyExpenseManagement';
import { ProfitAnalysis } from '@/components/ProfitAnalysis';

type TabType = 'overview' | 'tracking' | 'attendance' | 'salary' | 'expenses' | 'analysis';

export default function AgentsPage() {
    const { agents, transactions, addAgent, updateAgent, deleteAgent, isLoading, trackingData, loadingTracking, refreshData } = useData();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
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
            alert('Phone number must be exactly 10 digits');
            return;
        }

        try {
            if (editingAgent) {
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
            } else {
                if (!formData.agentId || !formData.password) {
                    alert('Agent ID and Password are required for new agents.');
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
            }
            setShowAddModal(false);
            resetForm();
        } catch (error) {
            console.error('Error saving agent:', error);
            alert('Failed to save agent. Please try again.');
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
        if (window.confirm('Are you sure you want to delete this agent?')) {
            try {
                await deleteAgent(id);
            } catch (error) {
                console.error('Error deleting agent:', error);
                alert('Failed to delete agent. Please try again.');
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
                            onClick={handleRefresh}
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
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="h-full overflow-y-auto p-6">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-emerald-100 rounded-lg">
                                        <Users size={20} className="text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-500">Total Agents</p>
                                        <p className="text-2xl font-bold text-slate-800">{activeAgents.length}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-blue-100 rounded-lg">
                                        <Target size={20} className="text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-500">Total Target</p>
                                        <p className="text-2xl font-bold text-slate-800">
                                            ₹{activeAgents.reduce((acc, a) => acc + (a.collectionTarget || 100000), 0).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-purple-100 rounded-lg">
                                        <TrendingUp size={20} className="text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-500">This Month Collected</p>
                                        <p className="text-2xl font-bold text-slate-800">
                                            ₹{activeAgents.reduce((acc, a) => acc + getAgentCollections(a.name), 0).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Agents Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Agent</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Division</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Phone</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Target</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Collected</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Achievement</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Status</th>
                                        <th className="text-center px-6 py-4 text-sm font-semibold text-slate-600">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={8} className="text-center py-12 text-slate-400">
                                                Loading agents...
                                            </td>
                                        </tr>
                                    ) : activeAgents.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="text-center py-12 text-slate-400">
                                                <Users size={48} className="mx-auto mb-3 opacity-50" />
                                                <p>No active agents. Add your first agent!</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        activeAgents.map(agent => {
                                            const collected = getAgentCollections(agent.name);
                                            const target = agent.collectionTarget || 100000;
                                            const percentage = Math.round((collected / target) * 100);
                                            const displayPercent = Math.min(percentage, 100);
                                            const isOverTarget = percentage >= 100;

                                            return (
                                                <tr key={agent.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-600">
                                                                {agent.name.split(' ').map(n => n[0]).join('')}
                                                            </div>
                                                            <div>
                                                                <div className="font-medium text-slate-800">{agent.name}</div>
                                                                {agent.agentId && <div className="text-xs text-slate-400">ID: {agent.agentId}</div>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2 text-slate-600">
                                                            <MapPin size={14} />
                                                            {agent.division || agent.area || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2 text-slate-600">
                                                            <Phone size={14} />
                                                            {agent.phone}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 font-medium text-slate-800">
                                                        ₹{target.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 font-medium text-slate-800">
                                                        ₹{collected.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="w-32">
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className={isOverTarget ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                                                                    {percentage}%
                                                                </span>
                                                            </div>
                                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${isOverTarget ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                                                    style={{ width: `${displayPercent}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${agent.isActive
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                            {agent.isActive ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => handleEdit(agent)}
                                                                className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                                                                title="Edit"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(agent.id)}
                                                                className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={16} />
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
