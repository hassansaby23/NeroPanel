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

// Helper to ensure URLs are absolute
function getAbsoluteUrl(url: string | null | undefined, baseUrl: string) {
    if (!url) return "";
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${baseUrl}${url}`;
    return url;
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  try {
      const { searchParams } = new URL(request.url);

      // Determine Base URL for Absolute URL generation
      const hostHeader = request.headers.get('host') || 'localhost';

  const protocolHeader = request.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${protocolHeader}://${hostHeader}`;

  const action = searchParams.get('action');
  
  // Try to find MAC in params, headers, or cookies
  let mac = searchParams.get('mac');
  
  if (!mac) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
          mac = authHeader.substring(7).trim();
      }
  }

  if (!mac) {
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
          const match = cookieHeader.match(/mac=([0-9A-Fa-f:]{17})/);
          if (match) {
              mac = match[1];
          }
      }
  }

  if (!mac) {
      // If request accepts HTML (browser), show a debug/login page
      const acceptHeader = request.headers.get('accept') || '';
      if (acceptHeader.includes('text/html')) {
          return new NextResponse(`
            <html>
              <head>
                <title>Stalker Portal Debug</title>
                <style>
                  body { font-family: system-ui, sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; background: #f8fafc; }
                  .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                  input { width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
                  button { width: 100%; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; }
                  button:hover { background: #1d4ed8; }
                  h1 { margin-top: 0; font-size: 1.5rem; color: #0f172a; }
                  p { color: #64748b; font-size: 0.875rem; }
                </style>
              </head>
              <body>
                <div class="card">
                  <h1>Stalker Portal Debug</h1>
                  <p>This endpoint requires a MAC address. Enter one below to test:</p>
                  <form method="GET">
                    <input type="text" name="mac" placeholder="00:1A:79:..." required pattern="^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$" />
                    <button type="submit">Connect</button>
                  </form>
                </div>
              </body>
            </html>
          `, { headers: { 'Content-Type': 'text/html' } });
      }
      
      console.log("Missing MAC. Headers:", Object.fromEntries(request.headers));
      return NextResponse.json({ type: "stb", error: "Missing MAC" }, { status: 400 });
  }

  const cleanMac = mac.toUpperCase();
  
  // 1. Get Upstream URL
  let upstreamConfig: any = null;
  try {
    upstreamConfig = await getActiveUpstreamServer();
    if (!upstreamConfig) {
      console.warn('No active upstream server configured.');
      return NextResponse.json({ type: "stb", error: "No Upstream Configured" }, { status: 503 });
    }
  } catch (err) {
    console.error('DB Error', err);
    return NextResponse.json({ error: 'Database Error' }, { status: 500 });
  }

  const upstreamUrl = upstreamConfig.server_url;

  // 2. Proxy Handler
  let responseBody: any = null;
  let status = 200;
  let headers: any = {};

  try {
        // Construct upstream URL
        // Try paths: 
        // 1. /c/server.php (Standard Stalker)
        // 2. /portal.php (Root Portal)
        // 3. /c/portal.php (Subdir Portal - Common in Xtream UI)
        // 4. /stalker_portal/server/load.php (Original Stalker)
        
        const forwardHeaders: any = {
            'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
            'X-Forwarded-For': '127.0.0.1', 
            'Accept': '*/*'
        };
        
        const cookie = request.headers.get('cookie');
        if (cookie) forwardHeaders['Cookie'] = cookie;

        const authHeader = request.headers.get('authorization');
        if (authHeader) forwardHeaders['Authorization'] = authHeader;
        
        // Prefer /portal.php if we are on root or if we had issues before
        // Based on user logs, this server uses /portal.php
        let targetUrl = `${upstreamUrl}/portal.php?${searchParams.toString()}`;

        console.log(`[Stalker Proxy] Processing ${action} for ${cleanMac} at ${targetUrl}`);

        const method = request.method;
        let requestBodyBuffer = null;
        if (method !== 'GET' && method !== 'HEAD') {
            try {
                requestBodyBuffer = await request.arrayBuffer();
            } catch (e) {
                console.warn('Could not read request body', e);
            }
        }

        // Clean headers significantly
        const cleanHeaders: Record<string, string> = {};
        cleanHeaders['User-Agent'] = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
        if (searchParams.get('token')) {
             cleanHeaders['Authorization'] = `Bearer ${searchParams.get('token')}`;
        }
        if (forwardHeaders['cookie']) {
            cleanHeaders['Cookie'] = forwardHeaders['cookie'];
        }

        let proxyRes;
        let success = false;
        
        // Attempt 1
        try {
            proxyRes = await axios({
                method: method,
                url: targetUrl,
                headers: cleanHeaders, 
                data: requestBodyBuffer,
                responseType: 'arraybuffer',
                validateStatus: () => true,
                maxRedirects: 5,
                decompress: true 
            });
            
            if (proxyRes.status === 200) success = true;
            else console.log(`[Stalker Proxy] ${targetUrl} failed (${proxyRes.status})`);

        } catch (error) {
            console.error(`[Stalker Proxy] Request failed: ${error}`);
        }

        // Retry logic for 404/520/403
        if (!success) {
             console.log(`[Stalker Proxy] Retrying with /c/server.php`);
             targetUrl = `${upstreamUrl}/c/server.php?${searchParams.toString()}`;
             try {
                proxyRes = await axios({
                    method: method,
                    url: targetUrl,
                    data: requestBodyBuffer,
                    headers: cleanHeaders,
                    validateStatus: () => true
                });
                if (proxyRes.status === 200) success = true;
                else console.log(`[Stalker Proxy] ${targetUrl} failed (${proxyRes.status})`);
             } catch(e) { console.error(e); }
        }
        
        if (!success) {
             console.log(`[Stalker Proxy] Retrying with /c/portal.php`);
             targetUrl = `${upstreamUrl}/c/portal.php?${searchParams.toString()}`;
             try {
                proxyRes = await axios({
                    method: method,
                    url: targetUrl,
                    data: requestBodyBuffer,
                    headers: cleanHeaders,
                    validateStatus: () => true
                });
                if (proxyRes.status === 200) success = true;
                else console.log(`[Stalker Proxy] ${targetUrl} failed (${proxyRes.status})`);
             } catch(e) { console.error(e); }
        }

        if (!success) {
             console.log(`[Stalker Proxy] Retrying with /stalker_portal/server/load.php`);
             targetUrl = `${upstreamUrl}/stalker_portal/server/load.php?${searchParams.toString()}`;
             try {
                proxyRes = await axios({
                    method: method,
                    url: targetUrl,
                    data: requestBodyBuffer,
                    headers: cleanHeaders,
                    validateStatus: () => true
                });
                if (proxyRes.status === 200) success = true;
                else console.log(`[Stalker Proxy] ${targetUrl} failed (${proxyRes.status})`);
             } catch(e) { console.error(e); }
        }

        // Fallback to Xtream Emulator if Upstream Stalker fails
        if (!success && upstreamConfig.username && upstreamConfig.password_hash) {
            console.log(`[Stalker Proxy] All upstream paths failed. Falling back to Xtream Emulator.`);
            const fallbackBody = await handleFallback(action, upstreamUrl, upstreamConfig, searchParams);
            if (fallbackBody) {
                 responseBody = fallbackBody;
                 success = true;
                 console.log("[Stalker Proxy] Fallback successful. Body keys:", Object.keys(fallbackBody));
            } else {
                 console.log("[Stalker Proxy] Fallback returned null/empty");
            }
        }

        if (!success && (!proxyRes || proxyRes.status === 520)) {
             console.log("[Stalker Proxy] Returning 520 Upstream Error");
             return new NextResponse("Upstream Error", { status: 520 });
        }
        
        if (!success) {
            status = proxyRes.status;
            headers = proxyRes.headers;
            try {
                const rawData = proxyRes.data.toString();
                responseBody = JSON.parse(rawData);
            } catch(e) {
                // Maybe not JSON?
                responseBody = proxyRes.data; // Keep as buffer/string
            }
        }

  } catch (err: any) {
      console.error("Proxy Error:", err.message);
      return NextResponse.json({ type: "stb", error: "Provider Error" }, { status: 502 });
  }

  // Handle Response Processing (Overrides)
  if (responseBody && responseBody.js && responseBody.js.data && action === 'get_ordered_list') {
         try {
             const [catOverridesRes, chOverridesRes] = await Promise.all([
                 pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true"),
                 pool.query("SELECT stream_id, is_hidden, custom_name, logo_url FROM channel_overrides")
             ]);
             
             const hiddenCats = new Set(catOverridesRes.rows.map(r => Number(r.category_id)));
             
             // Create Map for O(1) access
             const overrideMap = new Map();
             chOverridesRes.rows.forEach(r => {
                 overrideMap.set(Number(r.stream_id), r);
             });
             
             const filteredData = responseBody.js.data.reduce((acc: any[], ch: any) => {
                 const cid = Number(ch.id);
                 
                 // 1. Check Hidden (Channel Level)
                 if (overrideMap.has(cid) && overrideMap.get(cid).is_hidden) return acc;

                 // 2. Check Hidden (Category Level)
                 if (ch.tv_genre_id && hiddenCats.has(Number(ch.tv_genre_id))) return acc;
                 
                 // 3. Apply Custom Name & Logo
                 let finalCh = { ...ch };
                 const override = overrideMap.get(cid);

                 if (override) {
                     if (override.custom_name) {
                         finalCh.name = override.custom_name;
                     }
                     if (override.logo_url) {
                         // Custom logo from local DB -> make absolute to LOCAL server
                         finalCh.logo = getAbsoluteUrl(override.logo_url, baseUrl);
                     }
                 }
                 
                 // 4. Handle Upstream Relative Logos (if no custom logo)
                 if ((!override || !override.logo_url) && finalCh.logo && !finalCh.logo.startsWith('http')) {
                     const sep = finalCh.logo.startsWith('/') ? '' : '/';
                     finalCh.logo = `${upstreamUrl}${sep}${finalCh.logo}`;
                 }
                 
                 acc.push(finalCh);
                 return acc;
             }, []);
             
             responseBody.js.data = filteredData;
             responseBody.js.total_items = filteredData.length;
             responseBody.js.max_page_items = filteredData.length;
         } catch (e) {
             console.error("Error processing channels:", e);
         }
    }

    const nextRes = NextResponse.json(responseBody, { status: status });
    
    // Forward Set-Cookie
    if (headers['set-cookie']) {
        const cookies = Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [headers['set-cookie']];
        cookies.forEach((cookieStr: string) => {
            nextRes.headers.append('Set-Cookie', cookieStr);
        });
    }

    return nextRes;
  } catch (fatalError: any) {
      console.error("Fatal Handler Error:", fatalError);
      return NextResponse.json({ 
          error: "Internal Server Error", 
          message: fatalError.message, 
          stack: fatalError.stack 
      }, { status: 500 });
  }
}

// Fallback Function
async function handleFallback(action: string | null, upstreamUrl: string, config: any, searchParams: URLSearchParams) {
    console.log("Using Xtream Fallback for action:", action);
    
    if (action === 'handshake') {
        return { js: { token: 'mock_token_' + Date.now() } };
    }
    
    if (action === 'get_profile') {
        return { js: { id: 1, name: "User", login: "user", lang: "en" } };
    }

    if (action === 'get_genres') {
         const url = `${upstreamUrl}/player_api.php?username=${config.username}&password=${config.password_hash}&action=get_live_categories`;
         const data = await fetchXtream(url, {});
         if (!Array.isArray(data)) return { js: [] };
         
         const genres = data.map((c: any) => ({
             id: Number(c.category_id),
             title: c.category_name,
             alias: c.category_name
         }));
         return { js: genres };
    }

    if (action === 'get_ordered_list') {
         const url = `${upstreamUrl}/player_api.php?username=${config.username}&password=${config.password_hash}&action=get_live_streams`;
         const data = await fetchXtream(url, {});
         if (!Array.isArray(data)) return { js: { data: [], total_items: 0 } };
         
         const streams = data.map((s: any) => ({
             id: Number(s.stream_id),
             name: s.name,
             tv_genre_id: Number(s.category_id),
             logo: s.stream_icon,
             cmd: `ffmpeg ${upstreamUrl}/live/${config.username}/${config.password_hash}/${s.stream_id}.ts`
         }));
         
         // Return raw object so the main function can process overrides
         return { js: { data: streams, total_items: streams.length, max_page_items: streams.length } };
    }
    
    // Default empty
    return { js: {} };
}
