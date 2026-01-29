import { Settings } from 'lucide-react';

export default function RoutingRulesPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">Routing Rules</h1>
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <Settings className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900">Routing Configuration</h3>
        <p className="text-slate-500 mt-2">Configure how content requests are proxied or redirected.</p>
      </div>
    </div>
  );
}
