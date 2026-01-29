"use client";

import { useState, useEffect } from 'react';
import { Search, Edit2, Save, Upload, X, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

interface Channel {
  stream_id: number;
  name: string;
  stream_icon: string;
  epg_channel_id: string | null;
  custom_name: string | null;
  custom_logo: string | null;
  display_name: string;
  display_logo: string;
  is_hidden: boolean;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  
  // Editing State
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editForm, setEditForm] = useState({ logo_url: '', custom_name: '' });
  const [uploading, setUploading] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);

  useEffect(() => {
    fetchChannels();
  }, []);

  async function fetchChannels() {
    setLoading(true);
    try {
      const res = await fetch('/api/channels/list');
      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.error || 'Failed to load channels');
      }
      const data = await res.json();
      setChannels(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredChannels = channels.filter(c => 
    c.display_name.toLowerCase().includes(search.toLowerCase()) || 
    c.stream_id.toString().includes(search)
  );

  const openEdit = (channel: Channel) => {
    setEditingChannel(channel);
    setEditForm({
        logo_url: channel.custom_logo || channel.stream_icon,
        custom_name: channel.custom_name || channel.name
    });
  };

  const closeEdit = () => {
    setEditingChannel(null);
  };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload/logo', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      const fullUrl = `${window.location.protocol}//${window.location.host}${data.url}`;
      setEditForm(prev => ({ ...prev, logo_url: fullUrl }));
    } catch (err) {
      alert('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleEpgLogo = () => {
      if (!editingChannel?.epg_channel_id) {
          alert("This channel has no EPG ID");
          return;
      }
      
      // Construct URL based on EPG ID
      // Assuming user put logos in public/logos/EPG_ID.png
      const epgLogoUrl = `${window.location.protocol}//${window.location.host}/logos/${editingChannel.epg_channel_id}.png`;
      setEditForm(prev => ({ ...prev, logo_url: epgLogoUrl }));
  };

  const handleSave = async () => {
    if (!editingChannel) return;

    try {
        const res = await fetch('/api/channels/override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stream_id: editingChannel.stream_id,
                logo_url: editForm.logo_url,
                custom_name: editForm.custom_name === editingChannel.name ? null : editForm.custom_name
            })
        });

        if (!res.ok) throw new Error('Failed to save');

        // Update local state
        setChannels(prev => prev.map(c => {
            if (c.stream_id === editingChannel.stream_id) {
                return {
                    ...c,
                    custom_logo: editForm.logo_url,
                    custom_name: editForm.custom_name,
                    display_logo: editForm.logo_url,
                    display_name: editForm.custom_name || c.name
                };
            }
            return c;
        }));
        
        closeEdit();

    } catch (err) {
        alert('Failed to save changes');
    }
  };

  const handleAutoAssign = async () => {
      const targetChannels = channels.filter(c => c.epg_channel_id);
      
      if (targetChannels.length === 0) {
          alert("No channels found with EPG ID.");
          return;
      }

      if (!confirm(`Found ${targetChannels.length} channels with EPG ID.\n\nThis will auto-assign logos based on their EPG ID (e.g. /logos/EPG_ID.png).\n\nAre you sure you want to proceed?`)) {
          return;
      }

      setAutoAssigning(true);
      try {
          // Prepare bulk payload
          const updates = targetChannels.map(c => ({
              stream_id: c.stream_id,
              logo_url: `${window.location.protocol}//${window.location.host}/logos/${c.epg_channel_id}.png`,
              // We preserve existing custom name if any, otherwise null (which means don't change it in DB upsert logic if we passed it correctly, 
              // BUT our bulk API expects specific values. 
              // Actually, our API logic: 
              // DO UPDATE SET logo_url = COALESCE($2, channel_overrides.logo_url), custom_name = COALESCE($3, channel_overrides.custom_name)
              // If we pass NULL, COALESCE will keep the existing value. 
              // So we can just pass null for custom_name to preserve it.
              custom_name: null 
          }));

          // Send in chunks of 500 to avoid huge payloads if necessary, but 1000s might be fine.
          // Let's do it in one go for now, unless it's massive.
          
          const res = await fetch('/api/channels/override', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates)
          });

          if (!res.ok) throw new Error('Bulk update failed');

          const result = await res.json();
          alert(`Successfully updated ${result.count} channels.`);
          
          // Refresh
          fetchChannels();

      } catch (err) {
          console.error(err);
          alert('Failed to auto-assign logos');
      } finally {
          setAutoAssigning(false);
      }
  };

  const toggleVisibility = async (channel: Channel) => {
    // Optimistic Update
    const newStatus = !channel.is_hidden;
    setChannels(prev => prev.map(c => 
        c.stream_id === channel.stream_id ? { ...c, is_hidden: newStatus } : c
    ));

    try {
        await fetch('/api/channels/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stream_id: channel.stream_id,
                is_hidden: newStatus
            })
        });
    } catch (err) {
        alert("Failed to update visibility");
        // Revert
        setChannels(prev => prev.map(c => 
            c.stream_id === channel.stream_id ? { ...c, is_hidden: !newStatus } : c
        ));
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-bold text-slate-900">Channel Manager</h1>
            <p className="text-slate-500 mt-2">Customize channel logos and names</p>
        </div>
        <div className="flex gap-4 items-center">
            <button 
                onClick={handleAutoAssign}
                disabled={autoAssigning || loading}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
            >
                {autoAssigning ? 'Processing...' : 'Auto-Assign EPG Logos'}
            </button>
            <Link href="/" className="text-slate-500 hover:text-slate-900">Dashboard</Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6">
            {error}
        </div>
      )}

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input 
            type="text" 
            placeholder="Search channels..." 
            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading channels...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredChannels.slice(0, 100).map(channel => (
                <div key={channel.stream_id} className="bg-white border border-slate-200 rounded-lg p-4 flex gap-4 items-start">
                    <div className="w-16 h-16 bg-slate-100 rounded-md overflow-hidden flex-shrink-0 border border-slate-100">
                        <img 
                            src={channel.display_logo || '/placeholder.png'} 
                            alt={channel.display_name}
                            className="w-full h-full object-contain"
                            onError={(e) => { 
                                // Prevent infinite loop if placeholder also fails
                                const target = e.target as HTMLImageElement;
                                if (target.src !== 'https://via.placeholder.com/64?text=?') {
                                    target.src = 'https://via.placeholder.com/64?text=?';
                                }
                            }} 
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-slate-900 truncate" title={channel.display_name}>
                            {channel.display_name}
                        </h3>
                        <p className="text-xs text-slate-500 truncate">ID: {channel.stream_id}</p>
                        {channel.custom_logo && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mt-1 inline-block mr-1">Custom Logo</span>}
                        {channel.is_hidden && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded mt-1 inline-block">Hidden</span>}
                    </div>
                    <div className="flex flex-col gap-2">
                        <button 
                            onClick={() => openEdit(channel)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => toggleVisibility(channel)}
                            className={`p-2 rounded-full transition-colors ${channel.is_hidden ? 'text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-green-600 hover:bg-green-50'}`}
                            title={channel.is_hidden ? "Show Channel" : "Hide Channel"}
                        >
                            {channel.is_hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            ))}
            {filteredChannels.length > 100 && (
                <div className="col-span-full text-center py-4 text-slate-500">
                    Showing first 100 of {filteredChannels.length} results. Use search to find specific channels.
                </div>
            )}
        </div>
      )}

      {/* Edit Modal */}
      {editingChannel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Edit Channel</h2>
                    <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Channel Name</label>
                        <input 
                            type="text" 
                            className="w-full px-3 py-2 border border-slate-300 rounded-md"
                            value={editForm.custom_name}
                            onChange={e => setEditForm(prev => ({ ...prev, custom_name: e.target.value }))}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Logo</label>
                        
                        {/* Preview */}
                        <div className="w-24 h-24 bg-slate-100 mx-auto rounded-md border border-slate-200 mb-3 flex items-center justify-center overflow-hidden">
                             <img 
                                src={editForm.logo_url || 'https://via.placeholder.com/100'} 
                                className="max-w-full max-h-full object-contain"
                             />
                        </div>

                        <div className="flex gap-2 mb-2">
                             <label className="flex-1 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-md text-sm text-center flex items-center justify-center gap-2">
                                <Upload className="w-4 h-4" />
                                {uploading ? 'Uploading...' : 'Upload New Logo'}
                                <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={uploading} />
                             </label>
                             <button 
                                onClick={handleEpgLogo}
                                disabled={!editingChannel.epg_channel_id}
                                className="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-2 rounded-md text-sm text-center flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={editingChannel.epg_channel_id ? `Use ${editingChannel.epg_channel_id}.png` : "No EPG ID available"}
                             >
                                <span className="font-semibold">EPG</span> Use EPG ID
                             </button>
                        </div>

                        <input 
                            type="url" 
                            placeholder="https://..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                            value={editForm.logo_url}
                            onChange={e => setEditForm(prev => ({ ...prev, logo_url: e.target.value }))}
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
