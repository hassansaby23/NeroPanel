"use client";

import { useState } from 'react';
import { Film, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LocalContentList({ initialContent }: { initialContent: any[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this content?')) return;
    
    setDeletingId(id);
    try {
      const res = await fetch(`/api/content/local/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        window.location.reload(); 
      } else {
        alert('Failed to delete content');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete content');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {initialContent.map((item: any) => (
        <div key={item.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <div className="aspect-video bg-slate-100 relative">
             {item.poster_url ? (
                <img src={item.poster_url} alt={item.title} className="w-full h-full object-cover" />
             ) : (
                <div className="flex items-center justify-center h-full text-slate-300">
                    <Film className="w-10 h-10" />
                </div>
             )}
             <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded capitalize">
                {item.content_type}
             </div>
             {item.category_name && (
                <div className="absolute bottom-2 left-2 bg-blue-600/80 text-white text-xs px-2 py-1 rounded">
                   {item.category_name}
                </div>
             )}
          </div>
          <div className="p-4">
            <h3 className="font-semibold text-lg text-slate-900 truncate">{item.title}</h3>
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{item.description || 'No description'}</p>
            <div className="mt-4 flex justify-end gap-3 items-center">
               <Link 
                  href={`/local-content/edit/${item.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
               >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
               </Link>
               <button 
                 onClick={() => handleDelete(item.id)}
                 disabled={deletingId === item.id}
                 className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
               >
                 {deletingId === item.id ? 'Deleting...' : 'Delete'}
               </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
