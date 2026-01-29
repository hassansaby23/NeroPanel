import { Activity } from 'lucide-react';

export default function ApiMonitorPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">API Monitor</h1>
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900">Real-time monitoring coming soon</h3>
        <p className="text-slate-500 mt-2">View live request logs and performance metrics.</p>
      </div>
    </div>
  );
}
