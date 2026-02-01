'use client';

import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Search, Edit2, Trash2, Plus, X, Package, RefreshCw } from 'lucide-react';
import { Product } from '@/types';

export default function Inventory() {
    const { products, addProduct, updateProduct, deleteProduct } = useData();
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [stockUpdateProduct, setStockUpdateProduct] = useState<Product | null>(null);
    const [stockUpdateValue, setStockUpdateValue] = useState('');
    const [stockUpdateType, setStockUpdateType] = useState<'add' | 'set'>('add');

    // Form State - Note: productId is auto-generated, not user input
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '',
        category: 'Cookware',
        price: 0,
        stock: 0,
        gstRate: 0.18
    });

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.productId?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleOpenAdd = () => {
        setEditingProduct(null);
        setFormData({
            name: '',
            category: 'Cookware',
            price: 0,
            stock: 0,
            gstRate: 0.18
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (product: Product) => {
        setEditingProduct(product);
        setFormData({ ...product });
        setIsModalOpen(true);
    };

    const handleOpenStockUpdate = (product: Product) => {
        setStockUpdateProduct(product);
        setStockUpdateValue('');
        setStockUpdateType('add');
        setIsStockModalOpen(true);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this product?')) {
            deleteProduct(id);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingProduct) {
            updateProduct({
                ...editingProduct,
                ...formData as Product
            });
        } else {
            // Product ID is auto-generated in context
            addProduct(formData as Omit<Product, 'id' | 'productId'>);
        }
        setIsModalOpen(false);
    };

    const handleStockUpdate = () => {
        if (!stockUpdateProduct || !stockUpdateValue) return;

        const value = parseInt(stockUpdateValue);
        if (isNaN(value)) return;

        const newStock = stockUpdateType === 'add'
            ? stockUpdateProduct.stock + value
            : value;

        updateProduct({
            ...stockUpdateProduct,
            stock: Math.max(0, newStock)
        });

        setIsStockModalOpen(false);
    };

    return (
        <div className="p-6 h-full overflow-y-auto relative">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Inventory & Stock</h1>
                    <p className="text-sm text-slate-500">Manage products and stock levels</p>
                </div>
                <button
                    onClick={handleOpenAdd}
                    className="bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg"
                >
                    <Plus size={16} />
                    Add Product
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex gap-4 items-center">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search Product ID or Name..."
                            className="pl-10 pr-4 py-2 border rounded-lg w-full outline-none focus:ring-2 focus:ring-emerald-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="text-sm text-slate-500">
                        {filteredProducts.length} products
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-medium">
                            <tr>
                                <th className="p-4">Product ID</th>
                                <th className="p-4">Product Name</th>
                                <th className="p-4">Category</th>
                                <th className="p-4 text-right">Price</th>
                                <th className="p-4 text-center">Stock</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredProducts.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="p-4 font-mono text-slate-600 font-bold">{p.productId}</td>
                                    <td className="p-4 font-medium text-slate-800">{p.name}</td>
                                    <td className="p-4 text-slate-600">
                                        <span className="bg-slate-100 px-2 py-1 rounded text-xs">{p.category}</span>
                                    </td>
                                    <td className="p-4 text-right font-medium">₹{p.price.toLocaleString()}</td>
                                    <td className="p-4 text-center font-bold">{p.stock}</td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${p.stock > 50 ? 'bg-green-100 text-green-700' :
                                            p.stock > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {p.stock > 50 ? 'In Stock' : p.stock > 0 ? 'Low Stock' : 'Out of Stock'}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => handleOpenStockUpdate(p)}
                                                className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                title="Update Stock"
                                            >
                                                <RefreshCw size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleOpenEdit(p)}
                                                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edit Product"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(p.id)}
                                                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete Product"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Product Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingProduct ? 'Edit Product' : 'Add New Product'}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {/* Show Product ID only for editing */}
                            {editingProduct && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Product ID</label>
                                    <input
                                        type="text"
                                        disabled
                                        className="w-full p-2.5 border border-slate-300 rounded-lg bg-slate-100 text-slate-500 font-mono"
                                        value={editingProduct.productId}
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Product ID cannot be changed</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                                <select
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                >
                                    <option>Cookware</option>
                                    <option>Appliances</option>
                                    <option>Accessories</option>
                                    <option>Spares</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Price (₹)</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Stock Qty</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={formData.stock}
                                        onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">GST Rate</label>
                                    <select
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                        value={formData.gstRate}
                                        onChange={e => setFormData({ ...formData, gstRate: parseFloat(e.target.value) })}
                                    >
                                        <option value="0.05">5%</option>
                                        <option value="0.12">12%</option>
                                        <option value="0.18">18%</option>
                                        <option value="0.28">28%</option>
                                    </select>
                                </div>
                            </div>

                            {!editingProduct && (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                    <p className="text-sm text-blue-700">
                                        <strong>Note:</strong> Product ID will be auto-generated in PDI-XXX format (e.g., PDI-006)
                                    </p>
                                </div>
                            )}

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                                >
                                    {editingProduct ? 'Save Changes' : 'Add Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Update Stock Modal */}
            {isStockModalOpen && stockUpdateProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Package size={20} />
                                Update Stock
                            </h2>
                            <button
                                onClick={() => setIsStockModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <p className="font-medium text-slate-800">{stockUpdateProduct.name}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Product ID: <span className="font-mono font-bold">{stockUpdateProduct.productId}</span>
                                </p>
                                <p className="text-sm text-slate-500">Current Stock: <strong>{stockUpdateProduct.stock}</strong></p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Update Type</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setStockUpdateType('add')}
                                        className={`py-2.5 rounded-lg border-2 font-medium text-sm transition-all ${stockUpdateType === 'add'
                                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                            }`}
                                    >
                                        Add to Stock
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStockUpdateType('set')}
                                        className={`py-2.5 rounded-lg border-2 font-medium text-sm transition-all ${stockUpdateType === 'set'
                                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                            }`}
                                    >
                                        Set Stock To
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    {stockUpdateType === 'add' ? 'Quantity to Add' : 'New Stock Value'}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-lg font-medium text-center"
                                    placeholder="0"
                                    value={stockUpdateValue}
                                    onChange={e => setStockUpdateValue(e.target.value)}
                                />
                            </div>

                            {stockUpdateValue && (
                                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-center">
                                    <span className="text-sm text-emerald-700">New Stock: </span>
                                    <span className="font-bold text-emerald-800">
                                        {stockUpdateType === 'add'
                                            ? stockUpdateProduct.stock + (parseInt(stockUpdateValue) || 0)
                                            : parseInt(stockUpdateValue) || 0
                                        }
                                    </span>
                                </div>
                            )}

                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsStockModalOpen(false)}
                                    className="flex-1 py-3 text-slate-700 font-medium hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleStockUpdate}
                                    disabled={!stockUpdateValue}
                                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 disabled:bg-slate-300 disabled:shadow-none"
                                >
                                    Update Stock
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
