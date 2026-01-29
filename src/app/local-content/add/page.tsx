"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Search, X } from 'lucide-react';
import Link from 'next/link';

export default function AddLocalContentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  
  // TMDB State
  const [tmdbSearch, setTmdbSearch] = useState('');
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [searchingTmdb, setSearchingTmdb] = useState(false);
  const [showTmdbModal, setShowTmdbModal] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    content_type: 'movie',
    poster_url: '',
    stream_url: '',
    category_id: '',
    category_name: '',
    stream_id: '',
    subtitle_url: '',
    season_num: 1,
    episode_num: 1,
    metadata: {} as any
  });

  // Fetch categories when content_type changes
  useEffect(() => {
    async function fetchCategories() {
      setLoadingCategories(true);
      try {
        const res = await fetch(`/api/categories/upstream?type=${formData.content_type}`);
        if (res.ok) {
          const data = await res.json();
          setCategories(data);
        } else {
          console.error("Failed to fetch categories");
          setCategories([]);
        }
      } catch (e) {
        console.error("Error fetching categories", e);
        setCategories([]);
      } finally {
        setLoadingCategories(false);
      }
    }

    fetchCategories();
  }, [formData.content_type]);

  const [uploadingLogo, setUploadingLogo] = useState(false);

  // ...
  
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
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
      setFormData(prev => ({ ...prev, poster_url: fullUrl }));
    } catch (err) {
      console.error(err);
      alert('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const [uploadingSubtitle, setUploadingSubtitle] = useState(false);

  // ...

  const handleSubtitleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSubtitle(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload/subtitle', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      
      // Since this is client-side, we need the full URL including the domain/protocol if the user needs to play it.
      // But typically players just need the relative path if served from the same domain, OR an absolute URL.
      // `data.url` returns `/subtitles/filename.srt`.
      // Let's construct the full URL for better compatibility with external players.
      const fullUrl = `${window.location.protocol}//${window.location.host}${data.url}`;
      
      setFormData(prev => ({ ...prev, subtitle_url: fullUrl }));
    } catch (err) {
      console.error(err);
      alert('Failed to upload subtitle file');
    } finally {
      setUploadingSubtitle(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'category_id') {
       // Find category name
       const cat = categories.find(c => c.category_id === value);
       setFormData(prev => ({ 
           ...prev, 
           category_id: value,
           category_name: cat ? cat.category_name : ''
       }));
    } else {
       setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleTmdbSearch = async () => {
    if (!tmdbSearch.trim()) return;
    setSearchingTmdb(true);
    setError(''); // Clear previous errors
    
    try {
        const type = formData.content_type === 'series' ? 'tv' : 'movie';
        const apiKey = '73d2519f33d84184449e657fafca9352';
        const url = `https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&query=${encodeURIComponent(tmdbSearch)}&language=en-US&page=1&include_adult=false`;
        
        console.log("Fetching TMDB:", url);
        const res = await fetch(url);
        
        if (!res.ok) {
            throw new Error(`TMDB responded with status: ${res.status}`);
        }

        const data = await res.json();
        console.log("TMDB Data:", data);
        
        if (data && data.results && Array.isArray(data.results)) {
            setTmdbResults(data.results);
        } else {
            setTmdbResults([]);
            alert('No results found or invalid response format.');
        }
    } catch (e: any) {
        console.error("Search Exception:", e);
        setTmdbResults([]);
        alert('Search Error: ' + (e.message || 'Unknown error'));
    } finally {
        setSearchingTmdb(false);
    }
  };

  const selectTmdbItem = async (item: any) => {
    try {
        const type = formData.content_type === 'series' ? 'tv' : 'movie';
        // Direct Client-Side Fetch
        const res = await fetch(`https://api.themoviedb.org/3/${type}/${item.id}?api_key=73d2519f33d84184449e657fafca9352&language=en-US&append_to_response=credits,videos,images`);
        const details = await res.json();
        
        if (details && details.success !== false) {
            // Map TMDB details to our metadata structure
            const mappedMetadata = {
                tmdb_id: details.id?.toString() || "",
                name: type === 'movie' ? details.title : details.name,
                o_name: details.original_title || details.original_name,
                cover_big: details.poster_path ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${details.poster_path}` : "",
                movie_image: details.poster_path ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${details.poster_path}` : "",
                releasedate: details.release_date || details.first_air_date || "",
                youtube_trailer: details.videos?.results?.[0]?.key ? `https://www.youtube.com/watch?v=${details.videos.results[0].key}` : "",
                director: "", // Needs credits parsing, simplified for now
                actors: details.credits?.cast?.slice(0, 10).map((c: any) => c.name).join(', ') || "",
                cast: details.credits?.cast?.slice(0, 10).map((c: any) => c.name).join(', ') || "",
                description: details.overview || "",
                plot: details.overview || "",
                age: "",
                country: details.production_countries?.[0]?.iso_3166_1 || "",
                genre: details.genres?.map((g: any) => g.name).join(', ') || "",
                backdrop_path: details.backdrop_path ? [`https://image.tmdb.org/t/p/w1280${details.backdrop_path}`] : [],
                duration_secs: (details.runtime || 0) * 60,
                duration: details.runtime ? `${Math.floor(details.runtime / 60)}:${(details.runtime % 60).toString().padStart(2, '0')}:00` : "00:00:00",
                rating: details.vote_average?.toString() || "5"
            };

            setFormData(prev => ({
                ...prev,
                title: mappedMetadata.name || prev.title,
                description: mappedMetadata.description || prev.description,
                poster_url: mappedMetadata.cover_big || prev.poster_url,
                metadata: mappedMetadata
            }));
            
            setShowTmdbModal(false);
        } else {
             alert('Failed to get details: ' + (details.status_message || 'Unknown error'));
        }
    } catch (e) {
        console.error(e);
        alert('Failed to get details');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/content/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) {
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            throw new Error(data.details || data.error || 'Failed to save');
        } catch (e) {
            console.error("Non-JSON Error Response:", text);
            throw new Error('Server returned invalid response');
        }
      }

      router.push('/local-content');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href="/local-content" className="flex items-center text-slate-500 hover:text-slate-900 mb-6">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Local Content
      </Link>

      <h1 className="text-3xl font-bold text-slate-900 mb-8">Add Local Content</h1>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ... Form Content ... */}
          {/* This part remains the same, just rendering the children we modified above */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                  <div className="flex gap-2">
                    <input
                        type="text"
                        name="title"
                        required
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.title}
                        onChange={handleChange}
                    />
                    <button 
                        type="button"
                        onClick={() => setShowTmdbModal(true)}
                        className="px-3 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                    >
                        <Search className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Content Type</label>
                  <select
                    name="content_type"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.content_type}
                    onChange={handleChange}
                  >
                    <option value="movie">Movie</option>
                    <option value="series">Series</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category (Upstream)</label>
                  <select
                    name="category_id"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.category_id}
                    onChange={handleChange}
                    disabled={loadingCategories}
                  >
                    <option value="">-- Select Category --</option>
                    {categories.map((cat: any) => (
                        <option key={cat.category_id} value={cat.category_id}>
                            {cat.category_name}
                        </option>
                    ))}
                  </select>
                  {loadingCategories && <p className="text-xs text-slate-500 mt-1">Loading categories...</p>}
                </div>

                {formData.content_type === 'movie' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Subtitle</label>
                    <div className="flex gap-2 items-center mb-2">
                        <input
                            type="file"
                            accept=".srt,.vtt"
                            onChange={handleSubtitleUpload}
                            className="block w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-md file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 file:text-blue-700
                                hover:file:bg-blue-100"
                            disabled={uploadingSubtitle}
                        />
                        {uploadingSubtitle && <span className="text-xs text-blue-500">Uploading...</span>}
                    </div>
                    <input
                      type="url"
                      name="subtitle_url"
                      placeholder="http://... (srt, vtt) or upload above"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-slate-50"
                      value={formData.subtitle_url}
                      onChange={handleChange}
                    />
                  </div>
                )}

                {formData.content_type === 'series' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Season #</label>
                      <input
                        type="number"
                        name="season_num"
                        min="1"
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.season_num}
                        onChange={handleChange}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Episode #</label>
                      <input
                        type="number"
                        name="episode_num"
                        min="1"
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.episode_num}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stream URL</label>
                  <input
                    type="url"
                    name="stream_url"
                    required
                    placeholder="http://..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.stream_url}
                    onChange={handleChange}
                  />
                  <p className="text-xs text-slate-500 mt-1">Direct link to video file (mp4, mkv, m3u8)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Custom Stream ID (Optional)</label>
                  <input
                    type="text"
                    name="stream_id"
                    placeholder="e.g. 956470"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.stream_id}
                    onChange={handleChange}
                  />
                  <p className="text-xs text-slate-500 mt-1">Leave blank to auto-generate (Random Number)</p>
                </div>
             </div>

             <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Poster URL (or Upload)</label>
                  <div className="flex gap-2 items-center mb-2">
                      <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="block w-full text-sm text-slate-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-md file:border-0
                              file:text-sm file:font-semibold
                              file:bg-blue-50 file:text-blue-700
                              hover:file:bg-blue-100"
                          disabled={uploadingLogo}
                      />
                      {uploadingLogo && <span className="text-xs text-blue-500">Uploading...</span>}
                  </div>
                  <input
                    type="url"
                    name="poster_url"
                    placeholder="http://..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-slate-50"
                    value={formData.poster_url}
                    onChange={handleChange}
                  />
                </div>
                
                {/* Preview */}
                <div className="aspect-[2/3] bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center overflow-hidden">
                    {formData.poster_url ? (
                        <img src={formData.poster_url} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-slate-400 text-sm">Poster Preview</span>
                    )}
                </div>
             </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              name="description"
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Content'}
            </button>
          </div>
        </form>
      </div>
      {/* TMDB Modal */}
      {showTmdbModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl h-[80vh] flex flex-col">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-xl font-bold">Search TMDB ({formData.content_type === 'movie' ? 'Movies' : 'TV Shows'})</h2>
                    <button type="button" onClick={() => setShowTmdbModal(false)}><X className="w-6 h-6 text-slate-400" /></button>
                </div>
                
                <div className="p-4 border-b border-slate-200 flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Enter movie/show name..." 
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
                        value={tmdbSearch}
                        onChange={e => setTmdbSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleTmdbSearch();
                            }
                        }}
                    />
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            handleTmdbSearch();
                        }}
                        disabled={searchingTmdb}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        {searchingTmdb ? 'Searching...' : 'Search Online'}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {Array.isArray(tmdbResults) && tmdbResults.map((item, index) => (
                            <div 
                                key={item?.id ? `tmdb-${item.id}` : `tmdb-idx-${index}`}
                                className="cursor-pointer group relative bg-slate-50 rounded-md p-2 hover:bg-slate-100 transition-colors"
                                onClick={() => selectTmdbItem(item)}
                            >
                                <div className="aspect-[2/3] bg-slate-200 rounded-md overflow-hidden mb-2 relative">
                                    {item?.poster_path ? (
                                        <img 
                                            src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} 
                                            className="w-full h-full object-cover" 
                                            alt={item.title || "Poster"}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs">
                                            No Image
                                        </div>
                                    )}
                                </div>
                                <h3 className="font-medium text-sm truncate text-slate-900">{item?.title || item?.name || "Unknown Title"}</h3>
                                <p className="text-xs text-slate-500">
                                    {item?.release_date || item?.first_air_date ? String(item.release_date || item.first_air_date).substring(0, 4) : 'N/A'}
                                </p>
                            </div>
                        ))}
                    </div>
                    {(!tmdbResults || tmdbResults.length === 0) && !searchingTmdb && (
                        <div className="text-center text-slate-500 py-12">
                            {tmdbSearch ? 'No results found' : 'Search for a movie or TV show'}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
