import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios from 'axios';
import { getActiveUpstreamServer } from '@/lib/server_config';

// Helper: Fetch Xtream API (Keep if needed, though we might not use it in pure proxy)
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
  let upstreamUrl = '';
  try {
    const config = await getActiveUpstreamServer();
    if (config) {
      upstreamUrl = config.server_url;
      // Do NOT strip trailing slash blindly, check if it looks like a path
      // But for consistency, let's normalize it to NO trailing slash
      if (upstreamUrl.endsWith('/')) upstreamUrl = upstreamUrl.slice(0, -1);
    } else {
      console.warn('No active upstream server configured.');
      return NextResponse.json({ type: "stb", error: "No Upstream Configured" }, { status: 503 });
    }
  } catch (err) {
    console.error('DB Error', err);
    return NextResponse.json({ error: 'Database Error' }, { status: 500 });
  }

  // 2. Proxy Handler
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
        
        // Base target
        let targetUrl = `${upstreamUrl}/c/server.php?${searchParams.toString()}`;
        if (upstreamUrl.endsWith('/c')) {
            targetUrl = `${upstreamUrl}/server.php?${searchParams.toString()}`;
        }
        console.log(`[Stalker Proxy] Processing ${action} for ${cleanMac} at ${targetUrl}`);

        const method = request.method;
        let requestBody = null;
        if (method !== 'GET' && method !== 'HEAD') {
            try {
                requestBody = await request.arrayBuffer();
            } catch (e) {
                console.warn('Could not read request body', e);
            }
        }

        let proxyRes = await axios({
            method: method,
            url: targetUrl,
            data: requestBody,
            headers: forwardHeaders,
            validateStatus: () => true
        });

        // Retry logic for 404s
        if (proxyRes.status === 404 || proxyRes.status === 520 || proxyRes.status === 403) {
             console.log(`[Stalker Proxy] /c/server.php failed (${proxyRes.status}). Trying /portal.php`);
             targetUrl = `${upstreamUrl}/portal.php?${searchParams.toString()}`;
             proxyRes = await axios({
                method: method,
                url: targetUrl,
                data: requestBody,
                headers: forwardHeaders,
                validateStatus: () => true
             });
        }
        
        if (proxyRes.status === 404 || proxyRes.status === 520 || proxyRes.status === 403) {
             console.log(`[Stalker Proxy] /portal.php failed (${proxyRes.status}). Trying /c/portal.php`);
             targetUrl = `${upstreamUrl}/c/portal.php?${searchParams.toString()}`;
             proxyRes = await axios({
                method: method,
                url: targetUrl,
                data: requestBody,
                headers: forwardHeaders,
                validateStatus: () => true
             });
        }

        if (proxyRes.status === 404 || proxyRes.status === 520 || proxyRes.status === 403) {
             console.log(`[Stalker Proxy] /c/portal.php failed (${proxyRes.status}). Trying /stalker_portal/server/load.php`);
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

        // Handle Response
        let responseBody = proxyRes.data;

        // Optional: Filter hidden channels & Apply Overrides
        if (action === 'get_ordered_list' && responseBody?.js?.data) {
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
                     // If existing logo is relative, it points to upstream.
                     // We must make it absolute pointing to upstreamUrl so client can fetch it.
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
                 // Continue with original data if filtering fails
             }
        }

        const nextRes = NextResponse.json(responseBody, { status: proxyRes.status });
        
        // Forward Set-Cookie
        if (proxyRes.headers['set-cookie']) {
            proxyRes.headers['set-cookie'].forEach((cookieStr: string) => {
                nextRes.headers.append('Set-Cookie', cookieStr);
            });
        }

        return nextRes;

  } catch (err: any) {
      console.error("Proxy Error:", err.message);
      return NextResponse.json({ type: "stb", error: "Provider Error" }, { status: 502 });
  }
}
