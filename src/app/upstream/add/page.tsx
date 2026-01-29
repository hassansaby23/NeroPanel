"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Activity } from 'lucide-react';
import Link from 'next/link';

export default function AddUpstreamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    server_url: '',
    username: '',
    password: '',
    timeout_seconds: 30
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');

    try {
      const res = await fetch('/api/upstream/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: formData.server_url,
          username: formData.username,
          password: formData.password
        })
      });
      
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        setTestResult(data);
      } catch (e) {
        console.error("Failed to parse JSON:", text);
        setError('Server returned invalid response (HTML instead of JSON)');
      }
    } catch (err) {
      setError('Test request failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/upstream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const text = await res.text();
      if (!res.ok) {
        try {
            const data = JSON.parse(text);
            throw new Error(data.error || 'Failed to save');
        } catch(e) {
            console.error("Save failed with non-JSON response:", text);
            throw new Error('Server returned invalid response (HTML instead of JSON)');
        }
      }

      router.push('/upstream');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href="/upstream" className="flex items-center text-slate-500 hover:text-slate-900 mb-6">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Upstream Servers
      </Link>

      <h1 className="text-3xl font-bold text-slate-900 mb-8">Add Upstream Server</h1>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Server URL</label>
            <input
              type="url"
              name="server_url"
              required
              placeholder="http://example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.server_url}
              onChange={handleChange}
            />
          </div>

          {/* Username and Password fields hidden as per user request for URL-only config */}
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username (Optional - For Admin Sync)</label>
              <input
                type="text"
                name="username"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.username}
                onChange={handleChange}
                placeholder="Only for content syncing"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password (Optional - For Admin Sync)</label>
              <input
                type="password"
                name="password"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.password}
                onChange={handleChange}
                placeholder="Only for content syncing"
              />
            </div>
          </div>
          
          <div>
             <label className="block text-sm font-medium text-slate-700 mb-1">Timeout (Seconds)</label>
             <input
                type="number"
                name="timeout_seconds"
                min="5"
                max="300"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.timeout_seconds}
                onChange={handleChange}
              />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {testResult && (
             <div className={`p-3 rounded-md text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <div className="font-medium">{testResult.message}</div>
                {testResult.serverInfo && (
                   <div className="mt-1 text-xs">
                      Server: {testResult.serverInfo.url} ({testResult.serverInfo.server_protocol})
                   </div>
                )}
             </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !formData.server_url}
              className="flex items-center px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Activity className="w-4 h-4 mr-2" />
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
