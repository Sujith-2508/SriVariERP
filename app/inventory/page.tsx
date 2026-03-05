'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';
import { Search, Edit2, Trash2, Plus, X, Package, RefreshCw, ChevronDown, Tag } from 'lucide-react';
import { Product } from '@/types';

export default function Inventory() {
    const { products, addProduct, updateProduct, deleteProduct } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');

    // Category dropdown state
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [categorySearch, setCategorySearch] = useState('');
    const categoryDropdownRef = useRef<HTMLDivElement>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [stockUpdateProduct, setStockUpdateProduct] = useState<Product | null>(null);
    const [stockUpdateValue, setStockUpdateValue] = useState('');
    const [stockUpdateType, setStockUpdateType] = useState<'add' | 'set'>('add');

    const [formData, setFormData] = useState<{
        productId: string;
        name: string;
        category: string;
        price: number | string;
        costPrice: number | string;
        stock: number | string;
        gstRate: number | string;
        hsnCode: string;
        unit: string;
    }>({
        productId: '',
        name: '',
        category: 'Castiron',
        price: '',
        costPrice: '',
        stock: '',
        gstRate: '',
        hsnCode: '',
        unit: 'nos'
    });

    // Refs for Enter key navigation (all fields)
    const productIdRef = useRef<HTMLInputElement>(null);
    const categoryRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const hsnRef = useRef<HTMLInputElement>(null);
    const unitRef = useRef<HTMLSelectElement>(null);
    const stockRef = useRef<HTMLInputElement>(null);
    const costRef = useRef<HTMLInputElement>(null);
    const priceRef = useRef<HTMLInputElement>(null);
    const gstRef = useRef<HTMLInputElement>(null);

    const productFieldRefs = [
        productIdRef,
        categoryRef,
        nameRef,
        hsnRef,
        unitRef,
        stockRef,
        costRef,
        priceRef,
        gstRef
    ];
    const { handleKeyDown: handleProductKeyDown } = useEnterKeyNavigation(productFieldRefs);

    // Derive unique categories from loaded products
    const uniqueCategories = useMemo(() => {
        const cats = new Set(products.map(p => p.category).filter(Boolean));
        return Array.from(cats).sort();
    }, [products]);

    const filteredProducts = useMemo(() => {
        return products
            .filter(p =>
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.productId?.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                // Extract numeric part of PDI-XXX for proper sorting
                const idA = parseInt(a.productId.replace(/[^\d]/g, '')) || 0;
                const idB = parseInt(b.productId.replace(/[^\d]/g, '')) || 0;
                if (idA !== idB) return idA - idB;

                // Secondary sort by stock
                if (a.stock !== b.stock) return a.stock - b.stock;

                // Tertiary sort by price
                return a.price - b.price;
            });
    }, [products, searchTerm]);

    const handleOpenAdd = () => {
        setEditingProduct(null);
        setFormData({
            productId: '',
            name: '',
            category: 'Castiron',
            price: '',
            costPrice: '',
            stock: '',
            gstRate: '',
            hsnCode: '',
            unit: 'nos'
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            ...product,
            costPrice: product.costPrice || '',
            gstRate: product.gstRate > 1 ? product.gstRate : product.gstRate * 100, // Convert decimal to percentage for display, handle legacy whole numbers
            hsnCode: product.hsnCode || '',
            unit: product.unit || 'nos'
        });
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
            setSyncStatus('syncing');
            deleteProduct(id)
                .then(() => { setSyncStatus('done'); setTimeout(() => setSyncStatus('idle'), 2000); })
                .catch(() => { setSyncStatus('error'); setTimeout(() => setSyncStatus('idle'), 3000); });
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Check for duplicate Product ID
        const isDuplicate = products.some(p =>
            p.productId === formData.productId && p.id !== (editingProduct?.id || '')
        );

        if (isDuplicate) {
            alert(`Duplicate Product ID: "${formData.productId}" is already in use by another product.`);
            productIdRef.current?.focus();
            return;
        }

        // Ensure price, costPrice and stock are numbers for saving
        const finalData: Product = {
            ...(editingProduct || {}), // Keep existing ID etc if editing
            ...formData,
            price: Number(formData.price) || 0,
            costPrice: Number(formData.costPrice) || 0,
            stock: Number(formData.stock) || 0,
            gstRate: (Number(formData.gstRate) || 0) / 100, // Convert percentage back to decimal
        } as Product;

        setSyncStatus('syncing');
        const op = editingProduct ? updateProduct(finalData) : addProduct(finalData);
        op
            .then(() => { setSyncStatus('done'); setTimeout(() => setSyncStatus('idle'), 2000); })
            .catch(() => { setSyncStatus('error'); setTimeout(() => setSyncStatus('idle'), 3000); });
        setIsModalOpen(false);
    };

    const handleStockUpdate = () => {
        if (!stockUpdateProduct || !stockUpdateValue) return;

        const value = parseFloat(stockUpdateValue);
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
        <div className="p-6 h-full overflow-y-auto relative" >

            {/* Sync status toast */}
            {syncStatus !== 'idle' && (
                <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold flex items-center gap-2 transition-all animate-in fade-in slide-in-from-bottom-2 ${syncStatus === 'syncing' ? 'bg-blue-600 text-white' :
                    syncStatus === 'done' ? 'bg-emerald-600 text-white' :
                        'bg-red-500 text-white'
                    }`}>
                    {syncStatus === 'syncing' && <RefreshCw size={15} className="animate-spin" />}
                    {syncStatus === 'syncing' ? 'Syncing to Google Sheet…' :
                        syncStatus === 'done' ? '✓ Synced to Google Sheet' :
                            '✗ Sync failed (saved locally)'}
                </div>
            )}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Inventory & Stock</h1>
                    <p className="text-sm text-slate-500">Manage products and stock levels</p>
                </div>
                <button
                    onClick={() => handleOpenAdd()}
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
                            id="inventory-search"
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
                                <th className="p-4">HSN Code</th>
                                <th className="p-4">Category</th>
                                <th className="p-4 text-right">Price</th>
                                <th className="p-4 text-center">Stock</th>
                                <th className="p-4 text-center">GST%</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredProducts.map(p => {
                                // Normalise GST for display: stored as decimal (0.05) or whole (5)
                                const gstDisplay = p.gstRate > 0 && p.gstRate < 1
                                    ? (p.gstRate * 100).toFixed(0)
                                    : p.gstRate.toFixed(0);
                                return (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="p-4 font-mono text-slate-600 font-bold">{p.productId}</td>
                                        <td className="p-4 font-medium text-slate-800">{p.name}</td>
                                        <td className="p-4 text-slate-500 font-mono text-xs">
                                            {p.hsnCode ? (
                                                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">{p.hsnCode}</span>
                                            ) : (
                                                <span className="text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-slate-600">
                                            <span className="bg-slate-100 px-2 py-1 rounded text-xs">{p.category}</span>
                                        </td>
                                        <td className="p-4 text-right font-medium">₹{p.price.toLocaleString()}</td>
                                        <td className="p-4 text-center">
                                            <span className={`font-bold ${p.stock <= 5 ? 'text-red-600' : 'text-slate-700'}`}>
                                                {p.stock.toFixed(3)}
                                            </span>
                                            <span className="text-[10px] text-slate-400 ml-1 uppercase">{p.unit || 'nos'}</span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs font-semibold">
                                                {gstDisplay}%
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
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Product Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Product ID *</label>
                                <input
                                    ref={productIdRef}
                                    type="text"
                                    required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white disabled:bg-slate-100 font-mono"
                                    value={formData.productId}
                                    onChange={e => setFormData({ ...formData, productId: e.target.value.toUpperCase() })}
                                    onKeyDown={(e) => handleProductKeyDown(e, 0)}
                                    placeholder="e.g. PDI-006"
                                />
                            </div>

                            {/* Category — Custom Themed Dropdown */}
                            <div className="relative" ref={categoryDropdownRef}>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                                <button
                                    type="button"
                                    onClick={() => { setShowCategoryDropdown(!showCategoryDropdown); setCategorySearch(''); }}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white flex items-center justify-between text-left"
                                >
                                    <span className={formData.category ? 'text-slate-900' : 'text-slate-400'}>
                                        {formData.category || 'Select or create a category'}
                                    </span>
                                    <ChevronDown size={16} className={`text-slate-500 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showCategoryDropdown && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                                        {/* Search inside dropdown */}
                                        <div className="p-2 border-b border-slate-100">
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="Search or type new category…"
                                                value={categorySearch}
                                                onChange={e => setCategorySearch(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && categorySearch.trim()) {
                                                        e.preventDefault();
                                                        setFormData({ ...formData, category: categorySearch.trim() });
                                                        setShowCategoryDropdown(false);
                                                    }
                                                    if (e.key === 'Escape') setShowCategoryDropdown(false);
                                                }}
                                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-400"
                                            />
                                        </div>

                                        {/* Existing categories */}
                                        <ul className="max-h-48 overflow-y-auto py-1">
                                            {uniqueCategories
                                                .filter(c => c.toLowerCase().includes(categorySearch.toLowerCase()))
                                                .map(cat => (
                                                    <li key={cat}>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setFormData({ ...formData, category: cat }); setShowCategoryDropdown(false); }}
                                                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-emerald-50 hover:text-emerald-700 transition-colors ${formData.category === cat ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-700'
                                                                }`}
                                                        >
                                                            <Tag size={12} className="opacity-50" />
                                                            {cat}
                                                        </button>
                                                    </li>
                                                ))}

                                            {uniqueCategories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase())).length === 0 && (
                                                <li className="px-4 py-2 text-sm text-slate-400 italic">No matching categories</li>
                                            )}
                                        </ul>

                                        {/* Create new */}
                                        {categorySearch.trim() && !uniqueCategories.find(c => c.toLowerCase() === categorySearch.toLowerCase()) && (
                                            <div className="border-t border-slate-100 p-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { setFormData({ ...formData, category: categorySearch.trim() }); setShowCategoryDropdown(false); }}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg font-medium transition-colors"
                                                >
                                                    <Plus size={14} />
                                                    Create &ldquo;{categorySearch.trim()}&rdquo;
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                                <input
                                    ref={nameRef}
                                    type="text"
                                    required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    onKeyDown={(e) => handleProductKeyDown(e, 2)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">HSN Code</label>
                                    <input
                                        type="text"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        placeholder="e.g. 7323"
                                        value={formData.hsnCode}
                                        onChange={e => setFormData({ ...formData, hsnCode: e.target.value })}
                                        ref={hsnRef}
                                        onKeyDown={(e) => handleProductKeyDown(e, 3)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                                    <select
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                        value={formData.unit}
                                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                        ref={unitRef}
                                        onKeyDown={(e) => handleProductKeyDown(e, 4)}
                                    >
                                        <option value="nos">Nos</option>
                                        <option value="kg">Kg</option>
                                        <option value="set">Set</option>
                                        <option value="pcs">Pcs</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.001"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        placeholder="0.000"
                                        value={formData.stock}
                                        onChange={e => setFormData({ ...formData, stock: e.target.value === '' ? '' : e.target.value })}
                                        ref={stockRef}
                                        onKeyDown={(e) => handleProductKeyDown(e, 5)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (₹)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        placeholder="0"
                                        value={formData.costPrice}
                                        onChange={e => setFormData({ ...formData, costPrice: e.target.value === '' ? '' : e.target.value })}
                                        ref={costRef}
                                        onKeyDown={(e) => handleProductKeyDown(e, 6)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Selling Price (₹) *</label>
                                    <input
                                        ref={priceRef}
                                        type="number"
                                        required
                                        min="0"
                                        step="0.01"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        placeholder="0"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value === '' ? '' : e.target.value })}
                                        onKeyDown={(e) => handleProductKeyDown(e, 7)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">GST Rate (%)</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        max="100"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={formData.gstRate}
                                        onChange={e => setFormData({ ...formData, gstRate: e.target.value })}
                                        ref={gstRef}
                                        onKeyDown={(e) => handleProductKeyDown(e, 8)}
                                    />
                                </div>
                            </div>

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
            )
            }

            {/* Update Stock Modal */}
            {
                isStockModalOpen && stockUpdateProduct && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsStockModalOpen(false)}>
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
                                <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">{stockUpdateProduct.name}</h2>
                                        <p className="text-sm text-slate-500">Current Stock: <span className="font-bold">{stockUpdateProduct.stock.toFixed(3)}</span> {stockUpdateProduct.unit || 'nos'}</p>
                                    </div>
                                    <div className="bg-white px-3 py-1 rounded-full border border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        ID: {stockUpdateProduct.productId || stockUpdateProduct.id.slice(0, 8)}
                                    </div>
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
                                        step="0.001"
                                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-lg font-medium text-center"
                                        placeholder="0.000"
                                        value={stockUpdateValue}
                                        onChange={e => setStockUpdateValue(e.target.value)}
                                    />
                                </div>

                                {stockUpdateValue && (
                                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-center">
                                        <span className="text-sm text-emerald-700">New Stock: </span>
                                        <span className="font-bold text-emerald-800">
                                            {stockUpdateType === 'add'
                                                ? (stockUpdateProduct.stock + (parseFloat(stockUpdateValue) || 0)).toFixed(3)
                                                : (parseFloat(stockUpdateValue) || 0).toFixed(3)
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
                                        onClick={() => handleStockUpdate()}
                                        disabled={!stockUpdateValue}
                                        className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 disabled:bg-slate-300 disabled:shadow-none"
                                    >
                                        Update Stock
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
