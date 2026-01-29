import Link from 'next/link';
import { Plus, Server } from 'lucide-react';
import pool from '@/lib/db';
import UpstreamList from './UpstreamList';

export const dynamic = 'force-dynamic';

async function getUpstreamServers() {
  try {
    const res = await pool.query('SELECT * FROM upstream_servers ORDER BY created_at DESC');
    return res.rows;
  } catch (error) {
    console.error("Failed to fetch upstream servers:", error);
    return [];
  }
}

export default async function UpstreamPage() {
  const servers = await getUpstreamServers();

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h1 className="text-3xl font-bold text-slate-900">Upstream Servers</h1>
           <p className="text-slate-500 mt-2">Manage Xtream Codes connections</p>
        </div>
        <Link href="/upstream/add" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          Add Server
        </Link>
      </div>

      {servers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <Server className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900">No servers configured</h3>
          <p className="text-slate-500 mt-2 mb-6">Connect an upstream Xtream server to start syncing content.</p>
          <Link href="/upstream/add" className="text-blue-600 hover:underline">Add your first server</Link>
        </div>
      ) : (
        <UpstreamList initialServers={servers} />
      )}
    </div>
  );
}
