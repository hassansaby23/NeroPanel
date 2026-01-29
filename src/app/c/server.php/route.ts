import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios from 'axios';
import { getActiveUpstreamServer } from '@/lib/server_config';

// Helper: Fetch Xtream API
async function fetchXtream(url: string, params: any) {
  try {
    const response = await axios.get(url, { params, timeout: 30000 });
    return response.data;
  } catch (error) {
    console.error('Xtream Fetch Error:', error);
    return null;
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const type = searchParams.get('type');
  
  // Try to find MAC in params, headers, or cookies
  let mac = searchParams.get('mac');
  
  if (!mac) {
      // Check Authorization Header (Bearer MAC)
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
          mac = authHeader.substring(7).trim();
      }
  }

  if (!mac) {
      // Check Cookies (mac=...)
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
          const match = cookieHeader.match(/mac=([0-9A-Fa-f:]{17})/);
          if (match) {
              mac = match[1];
          }
      }
  }

  // 1. Authenticate MAC
  if (!mac) {
    // If still no MAC, and it's a handshake, we might be able to forward blindly if auth_mode is proxy?
    // But we need the MAC for our local DB check.
    // However, some STBs send the MAC in a weird format or rely on the server to request it.
    
    // Let's log headers to debug if we can't find it.
    console.log("Missing MAC. Headers:", Object.fromEntries(request.headers));
    
    return NextResponse.json({ type: "stb", error: "Missing MAC" }, { status: 400 });
  }

  // Normalize MAC
  const cleanMac = mac.toUpperCase();
  let device = { username: '', password: '', is_active: true, auth_mode: 'local' };

  try {
    const deviceRes = await pool.query(
      'SELECT username, password, is_active FROM mag_devices WHERE mac_address = $1',
      [cleanMac]
    );

    if (deviceRes.rowCount === 0) {
       // --- PROXY AUTHENTICATION FALLBACK ---
       // If MAC not in DB, assume "Proxy Mode" (registered on upstream)
       // We will try to fetch the upstream Stalker Portal directly?
       // Actually, the prompt says "mag address already registered on the provider".
       // This implies NeroPanel doesn't know the credentials, but the Provider knows the MAC.
       
       // BUT, NeroPanel uses Xtream Codes API (M3U) to fetch the playlist.
       // Xtream Codes API generally DOES NOT support "Get Playlist by MAC" without a password.
       // It supports User/Pass.
       
       // If the user has a MAG line on the provider, they usually have a Username/Password hidden in the background.
       // OR the provider exposes a Stalker Portal at /c/.
       
       // Let's assume the user wants NeroPanel to act as a STALKER PROXY to the upstream.
       // This is complex because we need to forward `handshake` to upstream `/c/`.
       
       // For now, let's allow "Guest" access if the upstream supports it, OR fail gracefully.
       // But practically, NeroPanel MUST know the credentials to fetch the list via Xtream API.
       
       // Let's return a helpful error for now, because we cannot magically guess the credentials
       // unless we implement full Stalker Proxying (forwarding requests to upstream /c/).
       
       // Let's implement basic Stalker Proxying for unknown MACs!
       device.auth_mode = 'proxy';
    } else {
        const row = deviceRes.rows[0];
        if (!row.is_active) {
            return NextResponse.json({ type: "stb", error: "Your STB is blocked." }, { status: 403 });
        }
        device.username = row.username;
        device.password = row.password;
    }

    // 2. Get Upstream Config (Cached)
    const config = await getActiveUpstreamServer();
    let upstreamUrl = config?.server_url || '';
    if (upstreamUrl.endsWith('/')) upstreamUrl = upstreamUrl.slice(0, -1);
    
    // --- PROXY MODE HANDLER ---
    if (device.auth_mode === 'proxy') {
        // We forward the request to the Upstream Stalker Portal
        // Construct upstream URL: upstreamUrl/c/server.php?...
        
        // We need to capture ALL headers to be safe (Cookies, User-Agent)
        const forwardHeaders: any = {
            'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0',
            'X-Forwarded-For': '127.0.0.1', // Anonymize?
            'Accept': '*/*'
        };
        
        const cookie = request.headers.get('cookie');
        if (cookie) forwardHeaders['Cookie'] = cookie;
        
        // Forward the exact query string
        // We will try multiple paths if one fails, or try to detect the original path.
        // Common paths: /c/server.php, /portal.php, /stalker_portal/server/load.php
        
        let targetPath = '/c/server.php';
        
        // Quick heuristic: If we can detect what the client asked for (via Referer or custom header?), use that.
        // But for now, let's try to fall back.
        
        let targetUrl = `${upstreamUrl}${targetPath}?${searchParams.toString()}`;
        console.log(`[Stalker Proxy] Attempt 1: ${targetUrl}`);

        const method = request.method;
        let requestBody = null;
        if (method !== 'GET' && method !== 'HEAD') {
            try {
                requestBody = await request.arrayBuffer();
            } catch (e) {
                console.warn('Could not read request body', e);
            }
        }

        try {
            let proxyRes = await axios({
                method: method,
                url: targetUrl,
                data: requestBody,
                headers: forwardHeaders,
                validateStatus: () => true
            });

            // If 404, try /portal.php
            if (proxyRes.status === 404) {
                 console.log(`[Stalker Proxy] Attempt 1 failed (404). Trying /portal.php`);
                 targetUrl = `${upstreamUrl}/portal.php?${searchParams.toString()}`;
                 proxyRes = await axios({
                    method: method,
                    url: targetUrl,
                    data: requestBody,
                    headers: forwardHeaders,
                    validateStatus: () => true
                 });
            }
            
            // If still 404, try /stalker_portal/server/load.php
            if (proxyRes.status === 404) {
                 console.log(`[Stalker Proxy] Attempt 2 failed (404). Trying /stalker_portal/server/load.php`);
                 targetUrl = `${upstreamUrl}/stalker_portal/server/load.php?${searchParams.toString()}`;
                 proxyRes = await axios({
                    method: method,
                    url: targetUrl,
                    data: requestBody,
                    headers: forwardHeaders,
                    validateStatus: () => true
                 });
            }

            console.log(`[Stalker Proxy] Final Response: ${proxyRes.status} from ${targetUrl}`);
            
            // Forward Set-Cookie headers back to the client!
            
            // Forward Set-Cookie headers back to the client!
            // This is CRITICAL for Stalker session management (PHPSESSID usually).
            const responseHeaders: any = {
                'Content-Type': proxyRes.headers['content-type'] || 'application/json'
            };
            
            if (proxyRes.headers['set-cookie']) {
                // Next.js/Node fetch might merge multiple cookies into one string or array.
                // Axios returns array for set-cookie.
                // We need to set them on the NextResponse.
                // Note: NextResponse header 'Set-Cookie' might overwrite.
                // We will handle it below.
            }

            // If it's `get_ordered_list`, we might want to filter it?
            let responseBody = proxyRes.data;

            if (action === 'get_ordered_list' && responseBody?.js?.data) {
                 // Try to filter
                 const [catOverridesRes, chOverridesRes] = await Promise.all([
                     pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true"),
                     pool.query("SELECT stream_id, is_hidden FROM channel_overrides WHERE is_hidden = true")
                 ]);
                 
                 const hiddenCats = new Set(catOverridesRes.rows.map(r => Number(r.category_id))); // Stalker uses IDs
                 const hiddenChans = new Set(chOverridesRes.rows.map(r => Number(r.stream_id)));
                 
                 const filteredData = responseBody.js.data.filter((ch: any) => {
                     if (hiddenChans.has(Number(ch.id))) return false;
                     return true;
                 });
                 
                 responseBody.js.data = filteredData;
                 responseBody.js.total_items = filteredData.length;
                 responseBody.js.max_page_items = filteredData.length;
            }

            const nextRes = NextResponse.json(responseBody, { status: proxyRes.status });
            
            // Copy cookies
            if (proxyRes.headers['set-cookie']) {
                proxyRes.headers['set-cookie'].forEach((cookieStr: string) => {
                    nextRes.headers.append('Set-Cookie', cookieStr);
                });
            }

            return nextRes;

        } catch (err) {
            console.error("Proxy Error:", err);
            return NextResponse.json({ type: "stb", error: "Provider Error" }, { status: 502 });
        }
    }
    
    // --- LOCAL MODE HANDLER (Existing Logic) ---
    // credentials for upstream
    const { username, password } = device;

    // --- HANDLERS ---

    // A. Handshake
    if (action === 'handshake') {
        // If we are proxying, we MUST forward handshake to upstream to get a valid token.
        if (device.auth_mode === 'proxy') {
             // Logic handled by Proxy Handler above.
             // Wait, the Proxy Handler only runs if auth_mode is proxy.
             // But the Proxy Handler code block is BEFORE this "HANDLERS" block.
             // So if we are here, we are in LOCAL mode or Proxy Handler failed/didn't catch?
             // Ah, look at line 79: if (device.auth_mode === 'proxy') { ... return ... }
             // So if we are here, we are NOT proxying?
             
             // Wait, look at line 29: let device = ... auth_mode: 'local'
             // Line 61: device.auth_mode = 'proxy' (if not found in DB)
             
             // So if the Proxy Handler at line 79 catches it, it returns.
             // BUT, the Proxy Handler uses `targetUrl` constructed from `searchParams`.
             // If `action=handshake` is in params, it forwards it.
             
             // So why did the logs show 404 for handshake?
             // [2026-01-27T15:19:20.560Z] GET /portal.php?type=stb&action=handshake...
             // Next.js rewrites /portal.php -> /c/server.php
             // So this route IS hit.
             
             // If the MAC is NOT in DB, auth_mode = 'proxy'.
             // Then it enters the `if (device.auth_mode === 'proxy')` block.
             // It logs: [Stalker Proxy] Forwarding to: ...
             // Then it returns.
             
             // If the user saw 404 or errors, maybe the UPSTREAM returned 404?
             // Or maybe the rewrite didn't work?
             // The logs showed GET /portal.php ... 
             // If rewrite works, the log in Next.js usually shows the destination? 
             // Or maybe Next.js logs the original URL?
             
             // If the logs show 404, it means the route was not found.
             // But we added rewrites.
             
             // Wait, did we rebuild? Yes.
             
             // Let's assume the Rewrite IS working, but maybe the upstream is rejecting?
             // OR maybe the upstream URL is wrong?
             // "http://line.diatunnel.ink/c/server.php"
             
             // Let's force a "Local Handshake" even for Proxy Mode just to pass the first step?
             // NO, that would break the token chain. Stalker tokens are session bound.
             
             // Let's check if the Proxy Logic is actually being hit.
             // I added console logs. If the user says "getting errors", we need to see what error.
             // If the logs show the request coming in, but no "Forwarding to" log, then the route isn't running.
             
             // Actually, if the user sees 404 in the browser/app, it means Next.js didn't match the route.
             // /portal.php -> /c/server.php
             
             // Is it possible that `next.config.ts` changes didn't apply?
             // We restarted the container.
             
             // Let's add a fallback to handle /portal.php MANUALLY if rewrites fail?
             // We can create `src/app/portal.php/route.ts`? 
             // No, Next.js doesn't like dots in folder names for routes usually, or maybe it does?
             // Actually `src/app/portal.php/route.ts` is valid.
             
             // But let's look at the logs again.
             // The logs show: GET /portal.php ...
             // They don't show the status code in the standard log format I see above (just "GET ...").
             // If it was 404, usually it logs 404.
             
             // If the user says "errors in the app", maybe the handshake returned invalid JSON?
             // The upstream might return text/html if it fails?
             
             // Let's try to improve the Proxy Handler to handle errors better.
        }
        
        return NextResponse.json({
            "js": {
                "token": "valid_token_" + cleanMac // Mock token
            },
            "type": "stb",
            "action": "handshake"
        });
    }

    // B. Get Profile
    if (action === 'get_profile') {
        return NextResponse.json({
            "js": {
                "id": 1,
                "name": "NeroPanel User",
                "login": username,
                "lang": "en",
                "parent_password": "0000"
            },
            "type": "stb",
            "action": "get_profile"
        });
    }

    // C. Live Channels (get_ordered_list)
    if (action === 'get_ordered_list' && type === 'itv') {
        // Fetch All Streams (Upstream + Local)
        const [upstreamData, overridesRes, catOverridesRes, localRes] = await Promise.all([
            fetchXtream(`${upstreamUrl}/player_api.php`, { username, password, action: 'get_live_streams' }),
            pool.query('SELECT stream_id, logo_url, custom_name, is_hidden FROM channel_overrides'),
            pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true"),
            pool.query("SELECT id, title as name, poster_url as stream_icon, stream_url, category_id, stream_id FROM local_content WHERE content_type = 'live'")
        ]);

        const upstreamItems = Array.isArray(upstreamData) ? upstreamData : [];
        const hiddenCatSet = new Set(catOverridesRes.rows.map(r => r.category_id));
        const overrideMap = new Map();
        overridesRes.rows.forEach(r => overrideMap.set(Number(r.stream_id), r));

        // Prepare Local Items
        const localItems = localRes.rows.map(row => ({
            stream_id: !isNaN(Number(row.stream_id)) ? Number(row.stream_id) : 900000 + row.id, // Generate pseudo ID if needed
            name: row.name,
            stream_icon: row.stream_icon,
            category_id: row.category_id || "0",
            num: 0, // Will assign later
            custom_url: row.stream_url // Flag for custom URL
        }));

        // Merge Upstream + Local
        const allItems = [...upstreamItems, ...localItems];

        // Merge & Format to Stalker
        const channels = [];
        let num = 1;

        for (const item of allItems) {
            // Filter Hidden Category
            if (hiddenCatSet.has(item.category_id)) continue;
            
            const sid = Number(item.stream_id);
            let name = item.name;
            let logo = item.stream_icon;
            let hidden = false;

            if (overrideMap.has(sid)) {
                const ov = overrideMap.get(sid);
                if (ov.is_hidden) hidden = true;
                if (ov.custom_name) name = ov.custom_name;
                if (ov.logo_url) logo = ov.logo_url;
            }

            if (hidden) continue;

            // Construct CMD
            // If it's a local content with custom_url, use it (or proxy it?)
            // If it's upstream, use upstream URL.
            // Stalker needs a playable URL.
            
            let cmd = "";
            if (item.custom_url) {
                // For local content, we can provide the direct URL or a proxy URL.
                // Stalker players often support direct HTTP.
                // cmd = `ffrt ${item.custom_url}`;
                
                // Better: Use our own proxy endpoint so we can support tokens/monitoring later
                // But for now, direct is simplest.
                // However, Stalker "ffrt" usually means "ffmpeg run this".
                // Simple http link: "ffmpeg http://..."
                cmd = `ffmpeg ${item.custom_url}`; 
            } else {
                // Upstream
                cmd = `ffmpeg ${upstreamUrl}/live/${username}/${password}/${sid}.ts`;
            }

            channels.push({
                "id": sid,
                "name": name,
                "number": num, // Auto-numbering
                "cmd": cmd, 
                "logo": logo,
                "locked": 0,
                "fav": 0,
                "tv_genre_id": Number(item.category_id) // Add Genre ID mapping
            });
            num++;
        }

        return NextResponse.json({
            "js": {
                "total_items": channels.length,
                "max_page_items": channels.length,
                "selected_item": 0,
                "cur_page": 0,
                "data": channels
            },
            "type": "itv",
            "action": "get_ordered_list"
        });
    }

    // D. Get Genres (get_genres)
    if (action === 'get_genres' && type === 'itv') {
        // Fetch Categories
        const [upstreamData, catOverridesRes] = await Promise.all([
            fetchXtream(`${upstreamUrl}/player_api.php`, { username, password, action: 'get_live_categories' }),
            pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true")
        ]);

        const upstreamItems = Array.isArray(upstreamData) ? upstreamData : [];
        const hiddenCatSet = new Set(catOverridesRes.rows.map(r => r.category_id));

        const genres = [];
        for (const item of upstreamItems) {
             if (hiddenCatSet.has(item.category_id)) continue;
             
             genres.push({
                 id: Number(item.category_id), // Stalker expects ID
                 title: item.category_name,
                 alias: item.category_name.toLowerCase().replace(/[^a-z0-9]/g, '_')
             });
        }
        
        // Add "All"
        genres.unshift({ id: 0, title: "All", alias: "all" });

        return NextResponse.json({
            "js": genres,
            "type": "itv",
            "action": "get_genres"
        });
    }

    // E. Create Link (create_link)
    // Some Stalker players ask the server to "create_link" before playing.
    if (action === 'create_link') {
        const cmd = searchParams.get('cmd');
        const type = searchParams.get('type');
        // Usually cmd contains the ID or the partial link.
        // But if we provided the full URL in `get_ordered_list`, some players just play it.
        // If they call create_link, we just return the URL to play.
        
        // Simplified response
        return NextResponse.json({
            "js": {
                "cmd": cmd, // Just return what was requested if it's already a URL
                "url": cmd
            },
            "type": type,
            "action": "create_link"
        });
    }

    // Default
    return NextResponse.json({ type: "stb", error: "Action not supported" }, { status: 400 });

  } catch (error) {
    console.error("Stalker API Error:", error);
    return NextResponse.json({ type: "stb", error: "Internal Error" }, { status: 500 });
  }
}
