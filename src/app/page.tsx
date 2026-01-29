import { Activity, Server, Film, Database, Tv } from 'lucide-react';
import pool from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getStats() {
  try {
    const [upstreamRes, localRes, syncedRes] = await Promise.all([
      pool.query('SELECT count(*) FROM upstream_servers'),
      pool.query('SELECT count(*) FROM local_content'),
      pool.query('SELECT count(*) FROM synced_content')
    ]);

    return {
      upstreamCount: parseInt(upstreamRes.rows[0].count, 10),
      localCount: parseInt(localRes.rows[0].count, 10),
      syncedCount: parseInt(syncedRes.rows[0].count, 10),
    };
  } catch (error) {
    console.error('Stats Error:', error);
    return { upstreamCount: 0, localCount: 0, syncedCount: 0 };
  }
}

export default async function Dashboard() {
  const stats = await getStats();
  const totalContent = stats.localCount + stats.syncedCount;

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-2">System Overview and Status</p>
      </header>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Link href="/upstream" className="block bg-white p-6 rounded-lg shadow-sm border border-slate-200 hover:border-blue-500 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Upstream Servers</h3>
            <Server className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.upstreamCount}</div>
          <div className="text-xs text-slate-500 mt-1">Manage Connections</div>
        </Link>
        
        <Link href="/channels" className="block bg-white p-6 rounded-lg shadow-sm border border-slate-200 hover:border-blue-500 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Live Channels</h3>
            <Tv className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">Manager</div>
          <div className="text-xs text-slate-500 mt-1">Edit Logos & Names</div>
        </Link>

        <Link href="/local-content" className="block bg-white p-6 rounded-lg shadow-sm border border-slate-200 hover:border-blue-500 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Local Items</h3>
            <Film className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.localCount}</div>
          <div className="text-xs text-slate-500 mt-1">Manage Movies/Series</div>
        </Link>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">API Requests</h3>
            <Activity className="w-5 h-5 text-orange-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">--</div>
          <div className="text-xs text-slate-500 mt-1">Real-time load</div>
        </div>
      </div>

      {/* Recent Activity / Placeholders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Upstream Health</h3>
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-md text-center text-slate-500 text-sm">
              No upstream servers configured.
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent API Errors</h3>
          <div className="space-y-4">
             <div className="p-4 bg-slate-50 rounded-md text-center text-slate-500 text-sm">
              No errors logged.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
