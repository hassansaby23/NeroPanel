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

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  const { searchParams } = new URL(request.url);
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
        
        // Base target
        let targetUrl = `${upstreamUrl}/c/server.php?${searchParams.toString()}`;
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

        // Optional: Filter hidden channels if it's get_ordered_list
        if (action === 'get_ordered_list' && responseBody?.js?.data) {
             try {
                 const [catOverridesRes, chOverridesRes] = await Promise.all([
                     pool.query("SELECT category_id FROM category_overrides WHERE is_hidden = true"),
                     pool.query("SELECT stream_id, is_hidden FROM channel_overrides WHERE is_hidden = true")
                 ]);
                 
                 const hiddenCats = new Set(catOverridesRes.rows.map(r => Number(r.category_id)));
                 const hiddenChans = new Set(chOverridesRes.rows.map(r => Number(r.stream_id)));
                 
                 const filteredData = responseBody.js.data.filter((ch: any) => {
                     if (hiddenChans.has(Number(ch.id))) return false;
                     // Note: Stalker categories are usually tv_genre_id
                     if (ch.tv_genre_id && hiddenCats.has(Number(ch.tv_genre_id))) return false;
                     return true;
                 });
                 
                 responseBody.js.data = filteredData;
                 responseBody.js.total_items = filteredData.length;
                 responseBody.js.max_page_items = filteredData.length;
             } catch (e) {
                 console.error("Error filtering channels:", e);
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
