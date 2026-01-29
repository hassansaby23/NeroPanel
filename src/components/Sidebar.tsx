import Link from 'next/link';
import { LayoutDashboard, Server, Film, Activity, Settings, Tv, Folder } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col h-full">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-blue-500">NeroPanel</h1>
        <p className="text-xs text-slate-400 mt-1">Xtream Middleware</p>
      </div>
      <nav className="mt-6 flex-1">
        <Link href="/" className="flex items-center px-6 py-3 hover:bg-slate-800 text-gray-300 hover:text-white transition-colors">
          <LayoutDashboard className="w-5 h-5 mr-3" />
          Dashboard
        </Link>
        <Link href="/upstream" className="flex items-center px-6 py-3 hover:bg-slate-800 text-gray-300 hover:text-white transition-colors">
          <Server className="w-5 h-5 mr-3" />
          Upstream Servers
        </Link>
        <Link href="/channels" className="flex items-center px-6 py-3 hover:bg-slate-800 text-gray-300 hover:text-white transition-colors">
          <Tv className="w-5 h-5 mr-3" />
          Live Channels
        </Link>
        <Link href="/categories" className="flex items-center px-6 py-3 hover:bg-slate-800 text-gray-300 hover:text-white transition-colors">
          <Folder className="w-5 h-5 mr-3" />
          Categories
        </Link>
        <Link href="/local-content" className="flex items-center px-6 py-3 hover:bg-slate-800 text-gray-300 hover:text-white transition-colors">
          <Film className="w-5 h-5 mr-3" />
          Local Content
        </Link>

        <Link href="/api-monitor" className="flex items-center px-6 py-3 hover:bg-slate-800 text-gray-300 hover:text-white transition-colors">
          <Activity className="w-5 h-5 mr-3" />
          API Monitor
        </Link>
         <Link href="/routing-rules" className="flex items-center px-6 py-3 hover:bg-slate-800 text-gray-300 hover:text-white transition-colors">
          <Settings className="w-5 h-5 mr-3" />
          Routing Rules
        </Link>
      </nav>
      <div className="p-4 border-t border-slate-800">
        <div className="text-xs text-slate-500">Version 1.0.0</div>
      </div>
    </aside>
  );
}
