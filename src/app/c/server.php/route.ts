import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios from 'axios';
import { getActiveUpstreamServer } from '@/lib/server_config';



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
      // Allow request without MAC if upstream allows it (or let upstream handle the error)
      // Removed Stalker Debug Page as requested
      console.log("Missing MAC. Headers:", Object.fromEntries(request.headers));
  }

  const cleanMac = mac ? mac.toUpperCase() : '';
  
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
        // Simple transparent proxy: forward to upstream root (/) as requested
        // User requested to remove all "mag stuff" and fallback logic.
        
        let targetUrl = `${upstreamUrl}/?${searchParams.toString()}`;
        console.log(`[Stalker Proxy] Forwarding ${action} to ${targetUrl}`);

        const forwardHeaders: Record<string, string> = {
            'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
            'Accept': '*/*',
            'X-Forwarded-For': '127.0.0.1'
        };

        // Forward Auth & Cookie
        const authHeader = request.headers.get('authorization');
        if (authHeader) forwardHeaders['Authorization'] = authHeader;

        const cookie = request.headers.get('cookie');
        if (cookie) forwardHeaders['Cookie'] = cookie;

        const method = request.method;
        let requestBodyBuffer = null;
        if (method !== 'GET' && method !== 'HEAD') {
            try {
                requestBodyBuffer = await request.arrayBuffer();
            } catch (e) {
                console.warn('Could not read request body', e);
            }
        }

        const proxyRes = await axios({
            method: method,
            url: targetUrl,
            headers: forwardHeaders,
            data: requestBodyBuffer,
            responseType: 'arraybuffer',
            validateStatus: () => true,
            maxRedirects: 5,
            decompress: true
        });

        status = proxyRes.status;
        headers = proxyRes.headers;
        
        try {
            const rawData = proxyRes.data.toString();
            responseBody = JSON.parse(rawData);
        } catch(e) {
            // Not JSON or empty
            responseBody = proxyRes.data;
        }

        if (status >= 400) {
            console.log(`[Stalker Proxy] Upstream returned ${status}`);
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


