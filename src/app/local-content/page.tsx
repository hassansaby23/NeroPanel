import Link from 'next/link';
import { Plus, Film } from 'lucide-react';
import pool from '@/lib/db';
import LocalContentList from './LocalContentList';

export const dynamic = 'force-dynamic';

async function getLocalContent() {
  try {
    const res = await pool.query('SELECT * FROM local_content ORDER BY created_at DESC');
    return res.rows;
  } catch (error) {
    console.error("Failed to fetch local content:", error);
    return [];
  }
}

export default async function LocalContentPage() {
  const content = await getLocalContent();

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h1 className="text-3xl font-bold text-slate-900">Local Content</h1>
           <p className="text-slate-500 mt-2">Manage custom movies and series</p>
        </div>
        <Link href="/local-content/add" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          Add Content
        </Link>
      </div>

      {content.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <Film className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900">No local content</h3>
          <p className="text-slate-500 mt-2 mb-6">Add your own movies or series to mix with upstream content.</p>
          <Link href="/local-content/add" className="text-blue-600 hover:underline">Add your first item</Link>
        </div>
      ) : (
        <LocalContentList initialContent={content} />
      )}
    </div>
  );
}
