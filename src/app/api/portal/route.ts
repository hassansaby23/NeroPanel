import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import pool from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { getUpstreamForClient, getUpstreamHost } from '@/lib/upstream_balancer';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleProxy(request);
}

export async function POST(request: NextRequest) {
  return handleProxy(request);
}

async function handleProxy(request: NextRequest) {
  // Determine Client IP for Sticky Session
  const clientIp = request.headers.get('x-forwarded-for') || (request as any).ip || 'unknown';
  const UPSTREAM_ROOT = getUpstreamForClient(clientIp);
  const UPSTREAM_HOST = getUpstreamHost(UPSTREAM_ROOT);

  const queryString = request.nextUrl.search;
  // Always proxy to /portal.php on upstream
  const targetUrl = `${UPSTREAM_ROOT}/portal.php${queryString}`;

  console.log(`[ProxyRoot] Client: ${clientIp} -> Assigned Provider: ${UPSTREAM_ROOT}`);
  console.log(`[ProxyRoot] ${request.method} ${request.nextUrl.pathname} -> ${targetUrl}`);

  // --- Pre-check: Local Actions ---
  const action = request.nextUrl.searchParams.get('action');

  // 1. Intercept create_link for local content
  if (action === 'create_link') {
      const cmd = request.nextUrl.searchParams.get('cmd');
      if (cmd && cmd.startsWith('local:')) {
          console.log(`[ProxyRoot] Handling local create_link: ${cmd}`);
          return handleLocalCreateLink(cmd, request);
      }
  }

  // 2. Intercept get_ordered_list for local-only categories
  if (action === 'get_ordered_list') {
      const type = request.nextUrl.searchParams.get('type');
      const category = request.nextUrl.searchParams.get('category');
      if (type === 'vod' && category && category.startsWith('local_')) {
          console.log(`[ProxyRoot] Handling local vod list for category: ${category}`);
          return handleLocalVodList(category, request);
      }
  }

  // --- Standard Proxy Setup ---

  // 1. Prepare Request Headers
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (['host', 'content-length', 'connection', 'accept-encoding'].includes(key.toLowerCase())) return;
    requestHeaders[key] = value;
  });

  requestHeaders['Host'] = UPSTREAM_HOST;
  requestHeaders['X-Forwarded-Host'] = request.headers.get('host') || 'localhost';
  requestHeaders['X-Forwarded-Proto'] = request.headers.get('x-forwarded-proto') || 'http';
  
  // Align Referer
  const referer = `${UPSTREAM_ROOT}/stalker_portal/`;
  requestHeaders['Referer'] = referer;
  
  if (request.headers.get('user-agent')) {
    requestHeaders['User-Agent'] = request.headers.get('user-agent')!;
  } else {
      requestHeaders['User-Agent'] = 'MAG250';
  }
  
  if (!requestHeaders['X-User-Agent']) {
      requestHeaders['X-User-Agent'] = 'Model: MAG250; Link: Ethernet';
  }

  // 2. Handle Body
  let requestBody = undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
        requestBody = await request.arrayBuffer();
    } catch (e) {
        // Body might be empty
    }
  }

  // Debug: Log Outgoing Headers
  console.log('[ProxyRoot] Outgoing Headers:', JSON.stringify(requestHeaders, null, 2));

  // 3. Intercept and Modify Specific Actions
  const interceptActions = ['get_all_channels', 'get_ordered_list', 'get_genres', 'get_vod_genres', 'get_vod_categories'];

  if (action && interceptActions.includes(action)) {
      try {
          // Fetch JSON directly
          const response = await axios({
              method: request.method,
              url: targetUrl,
              headers: requestHeaders,
              data: requestBody,
              responseType: 'json', // Auto-parse JSON
              maxRedirects: 0,
              validateStatus: () => true,
          });

          if (response.status !== 200) {
              // Fallback to normal handling if not 200
              console.warn(`[ProxyRoot] Intercepted action ${action} returned status ${response.status}, skipping modification.`);
          } else {
              console.log(`[ProxyRoot] Intercepting and modifying action: ${action}`);
              let data = response.data;

              // Apply modifications
              if (action === 'get_all_channels') {
                  data = await modifyChannels(data, request);
              } else if (action === 'get_genres') {
                  data = await modifyGenres(data);
              } else if (action === 'get_vod_genres' || action === 'get_vod_categories') {
                  data = await modifyVodGenres(data);
              } else if (action === 'get_ordered_list') {
                   const type = request.nextUrl.searchParams.get('type');
                   if (type === 'vod') {
                       data = await modifyVodList(data, request);
                   } else if (type === 'series') {
                       data = await modifySeriesList(data, request);
                   } else {
                       data = await modifyChannels(data, request);
                   }
              }

              // Return modified JSON
              return NextResponse.json(data);
          }
      } catch (e: any) {
           console.error(`[ProxyRoot] Error intercepting ${action}:`, e.message);
           // Fall through to standard proxy logic if interception fails
      }
  }

  // 4. Standard Proxy Logic (Stream/Binary/Pass-through)
  try {
    const response = await axios({
      method: request.method,
      url: targetUrl,
      headers: requestHeaders,
      data: requestBody,
      responseType: 'arraybuffer',
      maxRedirects: 0,
      validateStatus: () => true,
    });

    console.log(`[ProxyRoot] Upstream Status: ${response.status}`);
    console.log(`[ProxyRoot] Upstream Response Headers:`, JSON.stringify(response.headers, null, 2));

    const responseHeaders = new Headers();
    const responseCookies: string[] = [];

    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    responseHeaders.set('Pragma', 'no-cache');
    responseHeaders.set('Expires', '0');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');

    Object.entries(response.headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (['content-length', 'transfer-encoding', 'connection', 'cache-control', 'pragma', 'expires'].includes(lowerKey)) return;

      if (lowerKey === 'set-cookie') {
        const cookies = Array.isArray(value) ? value : [value as string];
        cookies.forEach(cookie => {
          let newCookie = cookie.replace(/Domain=[^;]+;?/gi, '');
          responseCookies.push(newCookie);
          responseHeaders.append('Set-Cookie', newCookie);
        });
      } else if (lowerKey === 'location') {
        let location = value as string;
        console.log(`[ProxyRoot] Upstream Location: ${location}`);
        
        if (location.startsWith('http')) {
          const upstreamRegex = new RegExp(`^https?://${UPSTREAM_HOST}/c`, 'i');
          const upstreamRootRegex = new RegExp(`^https?://${UPSTREAM_HOST}`, 'i');
          location = location.replace(upstreamRegex, '/c');
          location = location.replace(upstreamRootRegex, '/c');
        } else if (location.startsWith('/')) {
          if (!location.startsWith('/c')) {
            location = `/c${location}`;
          }
        }
        
        if (location.includes(UPSTREAM_HOST)) {
            location = '/c/';
        }
        
        console.log(`[ProxyRoot] Rewritten Location: ${location}`);
        responseHeaders.set('Location', location);
      } else if (value !== undefined) {
        responseHeaders.set(key, value as string);
      }
    });

    // 5. Body Rewriting (The "Heavy" Lift)
    let responseBody = response.data;
    console.log(`[ProxyRoot] Upstream body length: ${responseBody ? responseBody.length : 0}`);

    const contentType = response.headers['content-type'];
    const isText = !contentType || 
        contentType.includes('text/') || 
        contentType.includes('javascript') || 
        contentType.includes('json') || 
        contentType.includes('xml');

    if (isText) {
        try {
            const host = request.headers.get('host') || 'localhost';
            const protocol = request.headers.get('x-forwarded-proto') || 'http';
            const myOrigin = `${protocol}://${host}`;
            let text = responseBody.toString('utf-8');
            console.log(`[ProxyRoot] Upstream body preview: ${text.substring(0, 100)}`);
            const myRoot = `${myOrigin}/c`;
            
            const regex = new RegExp(`https?://${UPSTREAM_HOST}/c`, 'gi');
            text = text.replace(regex, myRoot);
            
            const rootRegex = new RegExp(`https?://${UPSTREAM_HOST}`, 'gi');
            text = text.replace(rootRegex, myRoot);

            // Inject <base> tag to fix relative paths
            if (contentType && contentType.includes('html')) {
                 text = text.replace('<head>', `<head><base href="${myRoot}/" />`);
            }
            
            responseBody = Buffer.from(text);
        } catch (e) {
            console.error('[ProxyRoot] Error rewriting body:', e);
        }
    }

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('[ProxyRoot] Error:', error.message);
    return new NextResponse('Proxy Error', { status: 502 });
  }
}

// --- Modification Helpers ---

async function modifyChannels(data: any, request: NextRequest) {
    try {
        const channels = data?.js?.data;
        if (!Array.isArray(channels)) return data;

        // Fetch overrides
        const [channelOverridesRes, categoryOverridesRes] = await Promise.all([
            pool.query('SELECT stream_id, logo_url, custom_name, is_hidden FROM channel_overrides'),
            pool.query('SELECT category_id FROM category_overrides WHERE is_hidden = true')
        ]);

        const hiddenCatSet = new Set(categoryOverridesRes.rows.map(r => r.category_id));
        
        // Create Map for O(1) lookup
        const overrideMap = new Map();
        channelOverridesRes.rows.forEach(row => {
            overrideMap.set(Number(row.stream_id), row);
        });

        const host = request.headers.get('host') || 'localhost';
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        const baseUrl = `${protocol}://${host}`;

        // Scan available local logos
        const logosDir = path.join(process.cwd(), 'public', 'logos');
        const availableLogos = new Map<string, string>(); // Lowercase filename -> Actual filename
        try {
            if (fs.existsSync(logosDir)) {
                const files = fs.readdirSync(logosDir);
                files.forEach(f => availableLogos.set(f.toLowerCase(), f));
            }
        } catch (e) {
            console.error('[ProxyRoot] Error reading logos dir:', e);
        }

        const filteredChannels = [];

        for (const ch of channels) {
             // 1. Check Category Hidden Status
             const catId = ch.tv_genre_id || ch.category_id || "0";
             if (hiddenCatSet.has(String(catId))) {
                 continue; 
             }

             // 2. Check Channel Overrides
             const sid = Number(ch.id || ch.cmd?.replace('ffrt ', '').replace('ffmpeg ', '') || 0); // Heuristic for ID
             
             let override = null;
             if (overrideMap.has(sid)) {
                 override = overrideMap.get(sid);
             }
             
             // If hidden, skip
             if (override?.is_hidden) {
                 continue;
             }

             // Apply Overrides
             if (override) {
                 if (override.custom_name) {
                     ch.name = override.custom_name;
                 }
                 if (override.logo_url) {
                     ch.logo = override.logo_url.startsWith('http') 
                        ? override.logo_url 
                        : `${baseUrl}${override.logo_url.startsWith('/') ? '' : '/'}${override.logo_url}`;
                 }
             }

             // 3. Fallback: Check for local logo by xmltv_id (server.py logic)
             if ((!override || !override.logo_url) && (ch.xmltv_id || ch.tvg_id)) {
                 const xmltvId = ch.xmltv_id || ch.tvg_id;
                 const targetFilename = `${xmltvId}.png`.toLowerCase();
                 
                 if (availableLogos.has(targetFilename)) {
                      const actualFilename = availableLogos.get(targetFilename);
                      ch.logo = `${baseUrl}/logos/${actualFilename}`;
                 }
             }
             
             filteredChannels.push(ch);
        }
        
        data.js.data = filteredChannels;
        // Update total items count if present
        // Only update total_items if it matches the data length (implying non-paginated response)
        // Otherwise, if total_items > data.length, it's paginated, and updating it would break pagination.
        if (data.js.total_items && data.js.total_items === channels.length) {
            data.js.total_items = filteredChannels.length;
        }

        return data;
    } catch (e: any) {
        console.error('[ProxyRoot] Error modifying channels:', e);
        return data; // Return original on error
    }
}

async function modifyGenres(data: any) {
    try {
        const genres = data?.js?.data; // or js alone?
        if (!Array.isArray(genres)) return data;

        const res = await pool.query('SELECT category_id, category_name, is_hidden FROM category_overrides');
        const overrideMap = new Map();
        res.rows.forEach(r => overrideMap.set(String(r.category_id), r));

        const filteredGenres = [];
        for (const g of genres) {
            const catId = String(g.id);
            const override = overrideMap.get(catId);

            if (override?.is_hidden) {
                continue;
            }

            if (override?.category_name) {
                g.title = override.category_name; // Stalker uses 'title' for genre name
                g.alias = override.category_name;
            }
            
            filteredGenres.push(g);
        }

        data.js.data = filteredGenres;
        return data;
    } catch (e: any) {
        console.error('[ProxyRoot] Error modifying genres:', e);
        return data;
    }
}

// --- VOD Handlers ---

async function modifyVodGenres(data: any) {
    try {
        const genres = data?.js?.data || data?.js || [];
        if (!Array.isArray(genres)) return data;

        // Add Local Content Category
        genres.push({
            id: 'local_vod_all',
            title: 'Local Content',
            alias: 'Local Content',
            censored: 0
        });

        // Optionally add categories from DB
        const res = await pool.query('SELECT DISTINCT category_name FROM local_content WHERE content_type IN ($1, $2)', ['movie', 'series']);
        res.rows.forEach((row) => {
             if (row.category_name) {
                 // Encode category name in ID to allow stateless filtering later
                 const safeId = `local_cat_${Buffer.from(row.category_name).toString('hex')}`;
                 genres.push({
                     id: safeId,
                     title: `Local - ${row.category_name}`,
                     alias: `Local - ${row.category_name}`,
                     censored: 0
                 });
             }
        });

        if (data.js && data.js.data) {
            data.js.data = genres;
        } else if (data.js) {
            data.js = genres;
        }
        return data;
    } catch (e) {
        console.error('[ProxyRoot] Error modifying VOD genres:', e);
        return data;
    }
}

async function modifyVodList(data: any, request: NextRequest) {
    try {
        const list = data?.js?.data || [];
        
        // If the request was for ALL, we append.
        // If the request was for specific upstream category, we leave it (unless we want to mix).
        // Here we just append all local content to the list if the list is not empty or if it's the "All" category.
        
        // Note: The caller handles "local-only" categories via handleLocalVodList. 
        // This function intercepts the upstream response, so it's for "All" or "Upstream Category".
        
        // Let's just append local content if the list exists (e.g. "All Movies").
        // Or check if the category param is missing or '*'
        const category = request.nextUrl.searchParams.get('category');
        if (!category || category === '*' || category === '0') {
             // Only fetch Movies for the main VOD list to avoid series episodes appearing as movies
             const localContent = await fetchLocalVodContent(request, undefined, 'movie');
             // Merge
             data.js.data = [...list, ...localContent];
             if (data.js.total_items) {
                 data.js.total_items += localContent.length;
             }
        }

        return data;
    } catch (e) {
        console.error('[ProxyRoot] Error modifying VOD list:', e);
        return data;
    }
}

async function modifySeriesList(data: any, request: NextRequest) {
    try {
        // Placeholder for future Series modification
        // Currently just returns data to prevent modifyChannels from breaking pagination
        // In the future, we can inject local series here if needed.
        return data;
    } catch (e) {
        console.error('[ProxyRoot] Error modifying Series list:', e);
        return data;
    }
}

async function handleLocalVodList(category: string, request: NextRequest) {
    try {
        let content: any[] = [];
        if (category === 'local_vod_all') {
             content = await fetchLocalVodContent(request);
        } else if (category.startsWith('local_cat_')) {
             const hexName = category.replace('local_cat_', '');
             try {
                 const categoryName = Buffer.from(hexName, 'hex').toString('utf-8');
                 content = await fetchLocalVodContent(request, categoryName);
             } catch (e) {
                 console.error('[ProxyRoot] Error decoding category name:', e);
                 content = await fetchLocalVodContent(request); // Fallback to all
             }
        }
        
        const responseData = {
            js: {
                total_items: content.length,
                max_page_items: content.length,
                selected_item: 0,
                cur_page: 1,
                data: content
            }
        };
        
        return NextResponse.json(responseData);
    } catch (e: any) {
        console.error('[ProxyRoot] Error handling local VOD list:', e);
        return NextResponse.json({ js: { data: [] } });
    }
}

// Helper to format date for Stalker (Unix Timestamp in seconds)
function formatDateForStalker(dateInput: any): number {
    if (!dateInput) return 0;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 0;
    return Math.floor(d.getTime() / 1000); // Return seconds
}

async function fetchLocalVodContent(request: NextRequest, categoryName?: string, contentType: 'movie' | 'series' | 'all' = 'all') {
    const host = request.headers.get('host') || 'localhost';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const baseUrl = `${protocol}://${host}`;

    const items: any[] = [];

    // 1. Fetch Movies (if requested)
    if (contentType === 'all' || contentType === 'movie') {
        let movieQuery = 'SELECT id, title, stream_id, poster_url, created_at, stream_url FROM local_content WHERE content_type = $1';
        const movieParams: any[] = ['movie'];
        
        if (categoryName) {
            movieQuery += ' AND category_name = $2';
            movieParams.push(categoryName);
        }

        const moviesRes = await pool.query(movieQuery + ' ORDER BY created_at DESC', movieParams);
        
        moviesRes.rows.forEach(row => {
            let streamUrl = row.stream_url;
            if (streamUrl.startsWith('/')) {
                streamUrl = `${baseUrl}${streamUrl}`;
            }
            items.push({
                id: Number(row.stream_id) || Math.floor(Math.random() * 100000000),
                name: row.title,
                cmd: `local:${row.stream_id}`,
                screenshot_uri: row.poster_url,
                added: formatDateForStalker(row.created_at),
                hd: 1
            });
        });
    }
    
    // 2. Fetch Episodes/Series (if requested)
    // We need to join with local_content to get the Series info (like Category) if we filter by category
    if (contentType === 'all' || contentType === 'series') {
        let seriesQuery = `
            SELECT 
                e.id, 
                c.title as series_title, 
                e.season_num, 
                e.episode_num, 
                e.stream_id, 
                c.poster_url, 
                e.created_at, 
                e.stream_url 
            FROM local_episodes e
            JOIN local_content c ON e.series_id = c.id
            WHERE c.content_type = 'series'
        `;
        
        const seriesParams: any[] = [];
        
        if (categoryName) {
            seriesQuery += ' AND c.category_name = $1';
            seriesParams.push(categoryName);
        }

        const seriesRes = await pool.query(seriesQuery + ' ORDER BY e.created_at DESC', seriesParams);
        
        seriesRes.rows.forEach(row => {
            let streamUrl = row.stream_url;
            if (streamUrl.startsWith('/')) {
                streamUrl = `${baseUrl}${streamUrl}`;
            }
            items.push({
                id: Number(row.stream_id) || Math.floor(Math.random() * 100000000),
                name: `${row.series_title} - S${row.season_num} E${row.episode_num}`,
                cmd: `local:${row.stream_id}`,
                screenshot_uri: row.poster_url,
                added: formatDateForStalker(row.created_at),
                hd: 1
            });
        });
    }
    
    return items;
}

async function handleLocalCreateLink(cmd: string, request: NextRequest) {
    try {
        const streamId = cmd.replace('local:', '');
        
        // Check Movies
        const movieRes = await pool.query('SELECT stream_url FROM local_content WHERE stream_id = $1', [streamId]);
        
        let streamUrl = null;
        if ((movieRes.rowCount ?? 0) > 0) {
             streamUrl = movieRes.rows[0].stream_url;
        } else {
             // Check Episodes
             const epRes = await pool.query('SELECT stream_url FROM local_episodes WHERE stream_id = $1', [streamId]);
             if ((epRes.rowCount ?? 0) > 0) {
                 streamUrl = epRes.rows[0].stream_url;
             }
        }

        if (!streamUrl) {
            return NextResponse.json({ error: 'Content not found' }, { status: 404 });
        }
        
        const host = request.headers.get('host') || 'localhost';
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        const baseUrl = `${protocol}://${host}`;

        if (streamUrl.startsWith('/')) {
            streamUrl = `${baseUrl}${streamUrl}`;
        }
        
        console.log(`[ProxyRoot] Resolved local content ${streamId} to ${streamUrl}`);

        return NextResponse.json({
            js: {
                cmd: streamUrl, // The device should play this URL
                type: 'vod'
            }
        });
    } catch (e: any) {
        console.error('[ProxyRoot] Error creating local link:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
