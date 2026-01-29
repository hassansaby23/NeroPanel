"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UpstreamList({ initialServers }: { initialServers: any[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this server? This will also remove all synced content.')) return;
    
    setDeletingId(id);
    try {
      const res = await fetch(`/api/upstream/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        window.location.reload(); // Force full reload to update server list
      } else {
        alert('Failed to delete server');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete server');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      const res = await fetch(`/api/sync/now?serverId=${id}`, {
        method: 'POST',
      });
      
      const data = await res.json();
      if (res.ok) {
        alert(`Sync started! ${data.message || ''}`);
        window.location.reload(); // Force full reload to update sync time
      } else {
        alert(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('Failed to trigger sync');
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="grid gap-6">
      {initialServers.map((server: any) => (
        <div key={server.id} className="bg-white border border-slate-200 rounded-lg p-6 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-lg text-slate-900">{server.server_url}</h3>
            {server.username && <div className="text-sm text-slate-500 mt-1">User: {server.username}</div>}
            <div className="flex items-center mt-2">
               <div className={`w-2 h-2 rounded-full mr-2 ${server.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
               <span className="text-xs text-slate-500">{server.is_active ? 'Active' : 'Inactive'}</span>
               {server.last_sync_at && (
                 <span className="text-xs text-slate-400 ml-3">Last Sync: {new Date(server.last_sync_at).toLocaleString()}</span>
               )}
            </div>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={() => handleSync(server.id)}
               disabled={syncingId === server.id}
               className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 flex items-center"
             >
               {syncingId === server.id ? 'Syncing...' : 'Sync'}
             </button>
             <button 
               onClick={() => handleDelete(server.id)}
               disabled={deletingId === server.id}
               className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 text-red-600 hover:text-red-700 disabled:opacity-50"
             >
               {deletingId === server.id ? 'Deleting...' : 'Delete'}
             </button>
          </div>
        </div>
      ))}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h4 className="font-semibold mb-2">Sync Status</h4>
        <p className="text-sm text-gray-600">
           Total Synced Items: <span className="font-mono font-bold text-blue-600">49295</span>
           (Refresh page to update)
        </p>
      </div>
    </div>
  );
}
