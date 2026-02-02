'use client';

import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Sidebar } from '@/components/Sidebar';
import { Agent } from '@/types';
import { UserPlus, Edit2, Trash2, Users, Target, MapPin, Phone, X, Check, TrendingUp } from 'lucide-react';

export default function AgentsPage() {
    const { agents, transactions, addAgent, updateAgent, deleteAgent, isLoading } = useData();
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        division: '',
        collectionTarget: 100000,
        isActive: true,
    });

    // Calculate current month collections for each agent
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

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

    const resetForm = () => {
        setFormData({
            name: '',
            phone: '',
            division: '',
            collectionTarget: 100000,
            isActive: true,
        });
        setEditingAgent(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            if (editingAgent) {
                await updateAgent({
                    ...editingAgent,
                    name: formData.name,
                    phone: formData.phone,
                    division: formData.division,
                    area: formData.division,
                    collectionTarget: formData.collectionTarget,
                    isActive: formData.isActive,
                });
            } else {
                await addAgent({
                    name: formData.name,
                    phone: formData.phone,
                    division: formData.division,
                    area: formData.division,
                    collectionTarget: formData.collectionTarget,
                    isActive: formData.isActive,
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
            isActive: agent.isActive,
        });
        setEditingAgent(agent);
        setShowAddModal(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this agent?')) {
            try {
                await deleteAgent(id);
            } catch (error) {
                console.error('Error deleting agent:', error);
                alert('Failed to delete agent. Please try again.');
            }
        }
    };

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar currentView="AGENTS" />

            <main className="flex-1 overflow-y-auto p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Collection Agents</h1>
                        <p className="text-sm text-slate-500">Manage your collection agents and their targets</p>
                    </div>
                    <button
                        onClick={() => { resetForm(); setShowAddModal(true); }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
                    >
                        <UserPlus size={18} />
                        Add Agent
                    </button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-emerald-100 rounded-lg">
                                <Users size={20} className="text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Total Agents</p>
                                <p className="text-2xl font-bold text-slate-800">{agents.length}</p>
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
                                    ₹{agents.reduce((acc, a) => acc + (a.collectionTarget || 100000), 0).toLocaleString()}
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
                                    ₹{agents.reduce((acc, a) => acc + getAgentCollections(a.name), 0).toLocaleString()}
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
                            ) : agents.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-slate-400">
                                        <Users size={48} className="mx-auto mb-3 opacity-50" />
                                        <p>No agents yet. Add your first agent!</p>
                                    </td>
                                </tr>
                            ) : (
                                agents.map(agent => {
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
                                                    <span className="font-medium text-slate-800">{agent.name}</span>
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

                {/* Add/Edit Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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

                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Phone Number *</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        placeholder="Enter phone number"
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

                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Monthly Collection Target (₹)</label>
                                    <input
                                        type="number"
                                        value={formData.collectionTarget}
                                        onChange={(e) => setFormData({ ...formData, collectionTarget: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        placeholder="100000"
                                        min="0"
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                                    />
                                    <label htmlFor="isActive" className="text-sm text-slate-600">Agent is active</label>
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
            </main>
        </div>
    );
}
