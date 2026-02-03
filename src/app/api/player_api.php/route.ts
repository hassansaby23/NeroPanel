import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import httpClient from '@/lib/http_client';
import { curlRequest } from '@/lib/curl';
import redis from '@/lib/redis';
import crypto from 'crypto';
import { getUpstreamForClient } from '@/lib/upstream_balancer';

// Helper to generate cache key
function getCacheKey(prefix: string, params: any) {
  const hash = crypto.createHash('md5').update(JSON.stringify(params)).digest('hex');
  return `${prefix}:${hash}`;
}

// Helper to ensure URLs are absolute
function getAbsoluteUrl(url: string | null | undefined, baseUrl: string) {
    if (!url) return "";
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${baseUrl}${url}`;
    return url;
}

// Helper to fetch upstream content
async function fetchUpstream(url: string, params: any) {
  // Check Cache for specific actions
  const cacheableActions = [
      'get_live_streams', 
      'get_vod_streams', 
      'get_series', 
      'get_live_categories', 
      'get_vod_categories', 
      'get_series_categories',
      'get_simple_data_table',
      'get_short_epg',
      'get_vod_info',
      'get_series_info'
  ];
  let cacheKey = '';
  
  if (params.action && cacheableActions.includes(params.action)) {
       // We want to cache the CONTENT list globally, regardless of which user requested it.
       // This assumes all users have access to the same upstream channel list.
       // We exclude username/password from the cache key so all users share the same cache entry.
       
       const keyParams = { ...params };
       delete keyParams.username;
       delete keyParams.password;
       
       cacheKey = getCacheKey(`upstream:${params.action}`, keyParams);
       
       const cached = await redis.get(cacheKey);
      if (cached) {
          console.log(`[Cache] Hit for ${cacheKey}`);
          return JSON.parse(cached);
      }
  }

  const startTime = Date.now();
  console.log(`[Upstream] Starting fetch: ${url} (Action: ${params.action})`);
  
  try {
    // Use Curl instead of Axios for robust WAF bypass
    const data = await curlRequest(url, { params });
    
    const duration = Date.now() - startTime;
    const count = Array.isArray(data) ? data.length : 'Object';
    console.log(`[Upstream] Success in ${duration}ms. Items: ${count}`);
    
    // Set Cache
    if (cacheKey && data) {
        // Cache for 5 minutes (300 seconds)
        await redis.setex(cacheKey, 300, JSON.stringify(data));
    }

    return data;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[Upstream] Error after ${duration}ms: ${error.message} | URL: ${url}`);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const password = searchParams.get('password');
  const action = searchParams.get('action');

  // Determine Base URL for Absolute URL generation
  const hostHeader = request.headers.get('host') || 'localhost';
  const protocolHeader = request.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${protocolHeader}://${hostHeader}`;

  if (!username || !password) {
    return NextResponse.json({ user_info: { auth: 0 }, error: 'Missing credentials' }, { status: 401 });
  }

  // 1. Get Active Upstream Server (Rotated by IP)
  let upstreamUrl = '';
  try {
    const clientIp = request.headers.get('x-forwarded-for') || (request as any).ip || 'unknown';
    upstreamUrl = getUpstreamForClient(clientIp);
    // Force HTTPS for known providers that support it, to avoid 403/WAF issues
    if (upstreamUrl.startsWith('http://') && !upstreamUrl.includes('diatunnel.ink')) {
        upstreamUrl = upstreamUrl.replace('http://', 'https://');
    }
  } catch (err) {
    console.error('Upstream Selection Error', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }

    // 2. Authenticate against Upstream (if we have one)
  let upstreamUserInfo = null;
  let upstreamServerInfo = null;

  if (upstreamUrl) {
    // Try to get cached auth first
    const authCacheKey = getCacheKey('auth', { username, password, upstreamUrl });
    let authData = null;
    
    try {
        const cachedAuth = await redis.get(authCacheKey);
        if (cachedAuth) {
            authData = JSON.parse(cachedAuth);
        }
    } catch (e) {
        console.error('[Cache] Auth Read Error', e);
    }

    if (!authData) {
        // Check auth by calling the standard userInfo action (no action param or action=login)
        authData = await fetchUpstream(`${upstreamUrl}/player_api.php`, {
          username,
          password
        });
        
        // Cache if successful
        if (authData && authData.user_info && authData.user_info.auth === 1) {
            try {
                await redis.setex(authCacheKey, 600, JSON.stringify(authData)); // 10 minutes
            } catch (e) {
                console.error('[Cache] Auth Write Error', e);
            }
        }
    }

    if (authData && authData.user_info && authData.user_info.auth === 1) {
      upstreamUserInfo = authData.user_info;
      upstreamServerInfo = authData.server_info;
    } else {
      // Auth failed at upstream
      // Check if authData is actually valid JSON but indicates failure
      console.warn('[Upstream] Auth failed. Response:', JSON.stringify(authData));
       return NextResponse.json({ user_info: { auth: 0 }, error: 'Authentication failed at upstream' }, { status: 401 });
    }
  } else {
      // If no upstream, we might allow local-only access if we implement local users?
      return NextResponse.json({ error: 'No upstream server configured' }, { status: 503 });
  }

  // 3. Handle Actions
  if (action === 'get_vod_streams') {
    try {
      // A. Fetch Upstream Content (Forward Request)
      // Run upstream and local fetch in parallel for speed
      const [upstreamData, localRes, catOverridesRes] = await Promise.all([
        fetchUpstream(`${upstreamUrl}/player_api.php`, {
          username,
          password,
          action: 'get_vod_streams'
        }),
        pool.query(
          `SELECT id, title as name, poster_url as stream_icon, stream_url, metadata, category_id, stream_id
           FROM local_content
           WHERE content_type = 'movie'`
        ),
        pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true")
      ]);
      
      const hiddenCatSet = new Set(catOverridesRes.rows.map(r => r.category_id));
      
      const upstreamItems = Array.isArray(upstreamData) ? upstreamData : [];

      const localItems = localRes.rows.map(row => {
        // If stream_id is numeric, use it as num, otherwise default to 0
        const customId = row.stream_id || `loc_${row.id}`;
        const numId = !isNaN(Number(customId)) ? Number(customId) : 0;
        
        return {
          num: numId, 
          name: row.name,
          stream_type: "movie",
          stream_id: customId,
          stream_icon: getAbsoluteUrl(row.stream_icon, baseUrl),
          rating: "5",
          added: "0",
          container_extension: "mp4",
          stream_url: row.stream_url, // For reference
          direct_source: row.stream_url, // Some players check this
          category_id: row.category_id || "0"
        };
      });

      // C. Merge and Filter
      const allItems = [...upstreamItems, ...localItems];
      return NextResponse.json(allItems.filter(item => !hiddenCatSet.has(item.category_id)));

    } catch (error) {
      console.error('VOD Fetch Error', error);
      return NextResponse.json({ error: 'Failed to fetch streams' }, { status: 500 });
    }
  }

  if (action === 'get_series') {
     try {
      // A. Upstream
      const [upstreamData, localRes, catOverridesRes] = await Promise.all([
          fetchUpstream(`${upstreamUrl}/player_api.php`, {
            username,
            password,
            action: 'get_series'
          }),
          pool.query(
            `SELECT id, title as name, poster_url as stream_icon, metadata, category_id, stream_id
             FROM local_content
             WHERE content_type = 'series'`
          ),
          pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true")
      ]);

      const hiddenCatSet = new Set(catOverridesRes.rows.map(r => r.category_id));
      const upstreamItems = Array.isArray(upstreamData) ? upstreamData : [];

      const localItems = localRes.rows.map(row => ({
        num: 0,
        name: row.name,
        series_id: !isNaN(Number(row.stream_id)) ? Number(row.stream_id) : row.stream_id || `loc_${row.id}`, // Return Number if possible
        cover: getAbsoluteUrl(row.stream_icon, baseUrl),
        plot: row.metadata?.description || "",
        cast: row.metadata?.cast || "",
        director: row.metadata?.director || "",
        genre: row.metadata?.genre || "",
        releaseDate: row.metadata?.releasedate || "",
        last_modified: "0",
        rating: row.metadata?.rating || "5",
        youtube_trailer: row.metadata?.youtube_trailer || "",
        episode_run_time: "0",
        category_id: row.category_id || "0"
      }));

      const allItems = [...upstreamItems, ...localItems];
      return NextResponse.json(allItems.filter(item => !hiddenCatSet.has(item.category_id)));
     } catch (error) {
         console.error('Series Fetch Error', error);
         return NextResponse.json({ error: 'Failed to fetch series' }, { status: 500 });
     }
  }

  if (action === 'get_live_streams') {
      // Forward live streams + any local live channels (if added later)
       try {
        // Parallel fetch: Upstream + Overrides
        const [upstreamData, overridesRes, catOverridesRes] = await Promise.all([
            fetchUpstream(`${upstreamUrl}/player_api.php`, {
                username,
                password,
                action: 'get_live_streams'
            }),
            pool.query('SELECT stream_id, logo_url, custom_name, is_hidden FROM channel_overrides'),
            pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true")
        ]);
        
        const hiddenCatSet = new Set(catOverridesRes.rows.map(r => r.category_id));
        const upstreamItems = Array.isArray(upstreamData) ? upstreamData : [];
        
        // Create a Map for O(1) lookup
        const overrideMap = new Map();
        overridesRes.rows.forEach(row => {
            overrideMap.set(Number(row.stream_id), row);
        });

        // Apply overrides and Filter hidden
        const finalItems = upstreamItems.reduce((acc: any[], item: any) => {
            // Filter by Category first
            if (hiddenCatSet.has(item.category_id)) return acc;

            const sid = Number(item.stream_id);
            if (overrideMap.has(sid)) {
                const override = overrideMap.get(sid);
                
                // Skip if hidden
                if (override.is_hidden) return acc;

                acc.push({
                    ...item,
                    stream_icon: override.logo_url ? getAbsoluteUrl(override.logo_url, baseUrl) : item.stream_icon,
                    name: override.custom_name || item.name
                });
            } else {
                acc.push(item);
            }
            return acc;
        }, []);

        return NextResponse.json(finalItems);
       } catch (error) {
           return NextResponse.json({ error: 'Failed to fetch live streams' }, { status: 500 });
       }
  }

  if (action === 'get_live_categories') {
    try {
     const [upstreamData, overridesRes] = await Promise.all([
         fetchUpstream(`${upstreamUrl}/player_api.php`, {
             username,
             password,
             action: 'get_live_categories'
         }),
         pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true")
     ]);
     
     const hiddenSet = new Set(overridesRes.rows.map(r => r.category_id));
     const upstreamItems = Array.isArray(upstreamData) ? upstreamData : [];
     
     // Filter
     const finalItems = upstreamItems.filter((item: any) => !hiddenSet.has(item.category_id));

     return NextResponse.json(finalItems);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch live categories' }, { status: 500 });
    }
  }

  if (action === 'get_vod_categories') {
    try {
     const [upstreamData, overridesRes] = await Promise.all([
         fetchUpstream(`${upstreamUrl}/player_api.php`, {
             username,
             password,
             action: 'get_vod_categories'
         }),
         pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true")
     ]);
     
     const hiddenSet = new Set(overridesRes.rows.map(r => r.category_id));
     const upstreamItems = Array.isArray(upstreamData) ? upstreamData : [];
     
     // Filter
     const finalItems = upstreamItems.filter((item: any) => !hiddenSet.has(item.category_id));

     return NextResponse.json(finalItems);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch vod categories' }, { status: 500 });
    }
  }

  if (action === 'get_series_categories') {
    try {
     const [upstreamData, overridesRes] = await Promise.all([
         fetchUpstream(`${upstreamUrl}/player_api.php`, {
             username,
             password,
             action: 'get_series_categories'
         }),
         pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true")
     ]);
     
     const hiddenSet = new Set(overridesRes.rows.map(r => r.category_id));
     const upstreamItems = Array.isArray(upstreamData) ? upstreamData : [];
     
     // Filter
     const finalItems = upstreamItems.filter((item: any) => !hiddenSet.has(item.category_id));

     return NextResponse.json(finalItems);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch series categories' }, { status: 500 });
    }
  }

  if (action === 'get_vod_info') {
    const vodId = searchParams.get('vod_id');
    try {
        // Check if it's a local VOD (by prefix OR by database lookup)
        // We do a DB lookup first to support custom integer IDs
        const localRes = await pool.query(
            `SELECT id, title, poster_url, description, stream_url, metadata, stream_id
             FROM local_content
             WHERE (stream_id = $1 OR id::text = $1) AND content_type = 'movie'`,
            [vodId]
        );
        
        if (localRes.rowCount && localRes.rowCount > 0) {
            // Local VOD Info
            const row = localRes.rows[0];
            const meta = row.metadata || {};
            
            return NextResponse.json({
                info: {
                    tmdb_id: meta.tmdb_id || "",
                    name: row.title,
                    o_name: meta.o_name || row.title,
                    cover_big: getAbsoluteUrl(row.poster_url, baseUrl),
                    movie_image: getAbsoluteUrl(row.poster_url, baseUrl),
                    releasedate: meta.releasedate || "",
                    youtube_trailer: meta.youtube_trailer || "",
                    director: meta.director || "",
                    actors: meta.actors || "",
                    cast: meta.cast || "",
                    description: row.description,
                    plot: row.description,
                    age: meta.age || "",
                    country: meta.country || "",
                    genre: meta.genre || "",
                    backdrop_path: meta.backdrop_path || [],
                    duration_secs: meta.duration_secs || 0,
                    duration: meta.duration || "00:00:00",
                    rating: meta.rating || "5"
                },
                movie_data: {
                    stream_id: row.stream_id || `loc_${row.id}`,
                    name: row.title,
                    container_extension: "mp4",
                    stream_type: "movie",
                    stream_id_original: row.id,
                }
            });

        } else if (vodId?.startsWith('loc_')) {
             // Fallback for legacy ID format if not in stream_id column (shouldn't happen with update)
             const localId = vodId.replace('loc_', '');
             // ... Logic handled above by OR id::text = $1 if UUID passed
             // But just in case
             return NextResponse.json({});
        } else {
            // Upstream VOD Info
            const upstreamData = await fetchUpstream(`${upstreamUrl}/player_api.php`, {
                username,
                password,
                action: 'get_vod_info',
                vod_id: vodId
            });
            return NextResponse.json(upstreamData || {});
        }
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch vod info' }, { status: 500 });
    }
  }

  if (action === 'get_series_info') {
    const seriesId = searchParams.get('series_id');
    try {
        // Check local content (by stream_id or id)
        const localRes = await pool.query(
            `SELECT id, title, poster_url, description, metadata, stream_id
             FROM local_content
             WHERE (stream_id = $1 OR id::text = $1) AND content_type = 'series'`,
            [seriesId]
        );

        if (localRes.rowCount && localRes.rowCount > 0) {
            const row = localRes.rows[0];
            
            // Fetch Episodes from local_episodes table
            const episodesRes = await pool.query(
                `SELECT season_num, episode_num, title, container_extension, stream_id, duration
                 FROM local_episodes
                 WHERE series_id = $1
                 ORDER BY season_num ASC, episode_num ASC`,
                [row.id]
            );

            // Group episodes by season for Xtream format: { "1": [ep1, ep2], "2": [...] }
            const episodesMap: Record<string, any[]> = {};
            
            episodesRes.rows.forEach(ep => {
                const season = ep.season_num.toString();
                if (!episodesMap[season]) episodesMap[season] = [];
                
                episodesMap[season].push({
                    id: ep.stream_id,
                    episode_num: ep.episode_num,
                    title: ep.title,
                    container_extension: ep.container_extension || "mp4",
                    info: {
                        duration: ep.duration || "00:00:00",
                        plot: "", // Episode plot could be added later
                        rating: "5"
                    },
                    custom_sid: "",
                    added: "0",
                    season: ep.season_num,
                    direct_source: ""
                });
            });

            return NextResponse.json({
                seasons: Object.keys(episodesMap).map(s => ({
                    air_date: "",
                    episode_count: episodesMap[s].length,
                    id: s,
                    name: `Season ${s}`,
                    overview: "",
                    poster_path: getAbsoluteUrl(row.poster_url, baseUrl),
                    season_number: s
                })),
                info: {
                    name: row.title,
                    cover: getAbsoluteUrl(row.poster_url, baseUrl),
                    plot: row.description,
                    cast: row.metadata?.cast || "",
                    director: row.metadata?.director || "",
                    genre: row.metadata?.genre || "",
                    releaseDate: row.metadata?.releasedate || "",
                    rating: row.metadata?.rating || "5",
                    youtube_trailer: row.metadata?.youtube_trailer || "",
                    episode_run_time: "0",
                },
                episodes: episodesMap
            });

        } else if (seriesId?.startsWith('loc_')) {
             // Fallback
             return NextResponse.json({});
        } else {
            // Upstream Series Info
            const upstreamData = await fetchUpstream(`${upstreamUrl}/player_api.php`, {
                username,
                password,
                action: 'get_series_info',
                series_id: seriesId
            });
            return NextResponse.json(upstreamData || {});
        }
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch series info' }, { status: 500 });
    }
  }

  if (action === 'get_simple_data_table') {
    const streamId = searchParams.get('stream_id');
    try {
        const upstreamData = await fetchUpstream(`${upstreamUrl}/player_api.php`, {
            username,
            password,
            action: 'get_simple_data_table',
            stream_id: streamId
        });
        return NextResponse.json(upstreamData || { epg_listings: [] });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch EPG' }, { status: 500 });
    }
  }

  if (action === 'get_short_epg') {
    const streamId = searchParams.get('stream_id');
    const limit = searchParams.get('limit');
    try {
        const upstreamData = await fetchUpstream(`${upstreamUrl}/player_api.php`, {
            username,
            password,
            action: 'get_short_epg',
            stream_id: streamId,
            limit: limit
        });
        return NextResponse.json(upstreamData || { epg_listings: [] });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch short EPG' }, { status: 500 });
    }
  }

  // Default: Return Auth Info (Login success)
  let serverUrl = hostHeader;
  let serverPort = '80';
  let serverHttpsPort = '443';
  
  if (hostHeader.includes(':')) {
      const parts = hostHeader.split(':');
      serverUrl = parts[0];
      serverPort = parts[1];
  } else {
      serverPort = protocolHeader === 'https' ? '443' : '80';
  }

  return NextResponse.json({
    user_info: upstreamUserInfo,
    server_info: {
        ...upstreamServerInfo,
        url: serverUrl, 
        port: serverPort,
        https_port: serverHttpsPort,
        server_protocol: protocolHeader
    }
  });
}