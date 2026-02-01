import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import pool from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const UPSTREAM_HOST = 'line.diatunnel.ink';
const UPSTREAM_ROOT = `http://${UPSTREAM_HOST}`;

export async function GET(request: NextRequest) {
  return handleProxy(request);
}

export async function POST(request: NextRequest) {
  return handleProxy(request);
}

async function handleProxy(request: NextRequest) {
  const queryString = request.nextUrl.search;
  // Always proxy to /portal.php on upstream
  const targetUrl = `${UPSTREAM_ROOT}/portal.php${queryString}`;

  console.log(`[ProxyRoot] ${request.method} ${request.nextUrl.pathname} -> ${targetUrl}`);

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

  // 2. Intercept and Modify Specific Actions
  const action = request.nextUrl.searchParams.get('action');
  const interceptActions = ['get_all_channels', 'get_ordered_list', 'get_genres'];

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
              if (action === 'get_all_channels' || action === 'get_ordered_list') {
                  data = await modifyChannels(data, request);
              } else if (action === 'get_genres') {
                  data = await modifyGenres(data);
              }

              // Return modified JSON
              return NextResponse.json(data);
          }
      } catch (e: any) {
           console.error(`[ProxyRoot] Error intercepting ${action}:`, e.message);
           // Fall through to standard proxy logic if interception fails
      }
  }

  // 3. Standard Proxy Logic (Stream/Binary/Pass-through)
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
        const availableLogos = new Set<string>();
        try {
            if (fs.existsSync(logosDir)) {
                const files = fs.readdirSync(logosDir);
                files.forEach(f => availableLogos.add(f));
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
                 const logoFilename = `${xmltvId}.png`;
                 if (availableLogos.has(logoFilename)) {
                      ch.logo = `${baseUrl}/logos/${logoFilename}`;
                 }
             }
             
             filteredChannels.push(ch);
        }
        
        data.js.data = filteredChannels;
        // Update total items count if present
        if (data.js.total_items) {
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