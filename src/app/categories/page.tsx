"use client";

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Film, Tv, Video, Edit2, X, Save } from 'lucide-react';
import Link from 'next/link';

interface Category {
  category_id: string;
  category_name: string;
  is_hidden: boolean;
}

export default function CategoriesPage() {
  const [activeTab, setActiveTab] = useState<'live' | 'vod' | 'series'>('live');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Editing State
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchCategories();
  }, [activeTab]);

  async function fetchCategories() {
    setLoading(true);
    try {
      const res = await fetch(`/api/categories/list?type=${activeTab}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCategories(data);
      } else {
        setCategories([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setEditName(cat.category_name);
  };

  const closeEdit = () => {
    setEditingCategory(null);
    setEditName('');
  };

  const handleSave = async () => {
    if (!editingCategory) return;

    try {
        const res = await fetch('/api/categories/override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category_id: editingCategory.category_id,
                category_name: editName
            })
        });

        if (!res.ok) throw new Error('Failed to save');

        // Update local state
        setCategories(prev => prev.map(c => 
            c.category_id === editingCategory.category_id ? { ...c, category_name: editName } : c
        ));
        
        closeEdit();

    } catch (err) {
        alert('Failed to save changes');
    }
  };

  const toggleVisibility = async (cat: Category) => {
    // Optimistic Update
    const newStatus = !cat.is_hidden;
    setCategories(prev => prev.map(c => 
        c.category_id === cat.category_id ? { ...c, is_hidden: newStatus } : c
    ));

    try {
        await fetch('/api/categories/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category_id: cat.category_id,
                category_name: cat.category_name, // Optional: save name in case we want to rename later
                is_hidden: newStatus
            })
        });
    } catch (err) {
        alert("Failed to save changes");
        // Revert
        setCategories(prev => prev.map(c => 
            c.category_id === cat.category_id ? { ...c, is_hidden: !newStatus } : c
        ));
    }
  };

  const filtered = categories.filter(c => 
    c.category_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-bold text-slate-900">Category Manager</h1>
            <p className="text-slate-500 mt-2">Hide or show categories in your player</p>
        </div>
        <Link href="/" className="text-slate-500 hover:text-slate-900">Dashboard</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-slate-200 pb-1">
        <button 
            onClick={() => setActiveTab('live')}
            className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'live' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            <Tv className="w-4 h-4" /> Live TV
        </button>
        <button 
            onClick={() => setActiveTab('vod')}
            className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'vod' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            <Film className="w-4 h-4" /> Movies
        </button>
        <button 
            onClick={() => setActiveTab('series')}
            className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'series' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            <Video className="w-4 h-4" /> Series
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input 
            type="text" 
            placeholder="Search categories..." 
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading...</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-sm">
                    <tr>
                        <th className="px-6 py-3 font-medium">Category Name</th>
                        <th className="px-6 py-3 font-medium">ID</th>
                        <th className="px-6 py-3 font-medium text-right">Visibility</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filtered.map(cat => (
                        <tr key={cat.category_id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-medium text-slate-900">{cat.category_name}</td>
                            <td className="px-6 py-4 text-slate-500 text-sm">{cat.category_id}</td>
                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                <button 
                                    onClick={() => openEdit(cat)}
                                    className="px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md text-xs font-medium transition-colors flex items-center gap-1"
                                    title="Rename Category"
                                >
                                    <Edit2 className="w-3 h-3" /> Edit
                                </button>
                                <button 
                                    onClick={() => toggleVisibility(cat)}
                                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                        cat.is_hidden 
                                        ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                                    }`}
                                >
                                    {cat.is_hidden ? (
                                        <>
                                            <EyeOff className="w-3 h-3" /> Hidden
                                        </>
                                    ) : (
                                        <>
                                            <Eye className="w-3 h-3" /> Visible
                                        </>
                                    )}
                                </button>
                            </td>
                        </tr>
                    ))}
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                                No categories found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Rename Category</h2>
                    <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Category Name</label>
                        <input 
                            type="text" 
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                    <button onClick={closeEdit} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-md">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2">
                        <Save className="w-4 h-4" />
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
