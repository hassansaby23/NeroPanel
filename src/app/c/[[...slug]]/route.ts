import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const UPSTREAM_HOST = 'line.diatunnel.ink';
const UPSTREAM_ROOT = `http://${UPSTREAM_HOST}`;

async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  
  // Construct the target path
  const path = slug ? slug.join('/') : '';
  const queryString = request.nextUrl.search;
  
  // Construct target URL
  // Hybrid approach based on server.py analysis:
  // 1. portal.php -> http://line.diatunnel.ink/portal.php
  // 2. Everything else -> http://line.diatunnel.ink/c/...
  
  let targetUrl;
  if (path === 'portal.php' || path.startsWith('portal.php/')) {
    targetUrl = `${UPSTREAM_ROOT}/${path}${queryString}`;
  } else {
    // Force trailing slash for root /c request
    const effectivePath = path ? '/' + path : '/';
    targetUrl = `${UPSTREAM_ROOT}/c${effectivePath}${queryString}`;
  }

  console.log(`[Proxy] ${request.method} ${request.nextUrl.pathname} -> ${targetUrl}`);

  // 1. Prepare Request Headers
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    // Skip headers that node/axios will set or that are problematic
    if (['host', 'content-length', 'connection', 'accept-encoding'].includes(key.toLowerCase())) return;
    requestHeaders[key] = value;
  });

  // Set required headers for upstream
  requestHeaders['Host'] = UPSTREAM_HOST;
  requestHeaders['X-Forwarded-Host'] = request.headers.get('host') || 'localhost';
  requestHeaders['X-Forwarded-Proto'] = request.headers.get('x-forwarded-proto') || 'http';
  
  // Align with user's server.py Referer logic: REAL_PORTAL_URL.replace("portal.php", "stalker_portal/")
  // REAL_PORTAL_URL is http://line.diatunnel.ink/portal.php
  const referer = `${UPSTREAM_ROOT}/stalker_portal/`;
  requestHeaders['Referer'] = referer;
  
  // User-Agent preservation is critical for MAG devices
  if (request.headers.get('user-agent')) {
    requestHeaders['User-Agent'] = request.headers.get('user-agent')!;
  } else {
      // Default to MAG250 if missing, matching server.py behavior
      requestHeaders['User-Agent'] = 'MAG250';
  }
  
  // Always set X-User-Agent as server.py does
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

  try {
    // 3. Send Request to Upstream
    const response = await axios({
      method: request.method,
      url: targetUrl,
      headers: requestHeaders,
      data: requestBody,
      responseType: 'arraybuffer', // Get raw data
      maxRedirects: 0, // Manual redirect handling
      validateStatus: () => true, // Accept all status codes
    });

    console.log(`[Proxy] Upstream Status: ${response.status}`);
    console.log(`[Proxy] Upstream Response Headers:`, JSON.stringify(response.headers, null, 2));

    // 4. Prepare Response Headers
    const responseHeaders = new Headers();
    const responseCookies: string[] = [];

    // Force no-cache to prevent browser caching of redirects or old content
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    responseHeaders.set('Pragma', 'no-cache');
    responseHeaders.set('Expires', '0');

    // Ensure CORS is allowed for all origins
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');

    Object.entries(response.headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      
      // Skip problematic headers
      // Also skip cache-control as we want to enforce our own
      if (['content-length', 'transfer-encoding', 'connection', 'cache-control', 'pragma', 'expires'].includes(lowerKey)) return;

      if (lowerKey === 'set-cookie') {
        const cookies = Array.isArray(value) ? value : [value as string];
        cookies.forEach(cookie => {
          // Remove Domain and Secure to ensure it works on localhost/http
          let newCookie = cookie.replace(/Domain=[^;]+;?/gi, '');
          // newCookie = newCookie.replace(/Secure;?/gi, ''); // Optional: remove Secure if testing on http
          // newCookie = newCookie.replace(/SameSite=[^;]+;?/gi, ''); // Optional
          responseCookies.push(newCookie);
          responseHeaders.append('Set-Cookie', newCookie);
        });
      } else if (lowerKey === 'location') {
        let location = value as string;
        console.log(`[Proxy] Upstream Location: ${location}`);
        
        // Rewrite absolute URLs
        if (location.startsWith('http')) {
          const upstreamRegex = new RegExp(`^https?://${UPSTREAM_HOST}/c`, 'i');
          const upstreamRootRegex = new RegExp(`^https?://${UPSTREAM_HOST}`, 'i');
          
          location = location.replace(upstreamRegex, '/c');
          location = location.replace(upstreamRootRegex, '/c');
        } else if (location.startsWith('/')) {
          // Handle relative absolute paths
          if (!location.startsWith('/c')) {
            location = `/c${location}`;
          }
        }

        // Safety net: If it still contains the upstream domain, force it to /c/
        if (location.includes(UPSTREAM_HOST)) {
            console.log(`[Proxy] Safety net caught leaking URL: ${location}`);
            location = '/c/';
        }
        
        console.log(`[Proxy] Rewritten Location: ${location}`);
        responseHeaders.set('Location', location);
      } else if (value !== undefined) {
        responseHeaders.set(key, value as string);
      }
    });

    // Enforce No-Cache headers AFTER processing upstream headers
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    responseHeaders.set('Pragma', 'no-cache');
    responseHeaders.set('Expires', '0');

    // 5. Body Rewriting (The "Heavy" Lift)
    let responseBody = response.data;
    const contentType = response.headers['content-type'];
    
    // Always attempt to rewrite if it looks like text, json, or js
    // Or if content-type is missing but it's likely text
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
            
            // Global replace of upstream URL with ours
            // http://line.diatunnel.ink/c -> http://localhost:3000/c
            const myRoot = `${myOrigin}/c`;
            
            // 1. Replace specific /c paths first (if any)
            // Covers: http://line.diatunnel.ink/c and https://line.diatunnel.ink/c
            const regex = new RegExp(`https?://${UPSTREAM_HOST}/c`, 'gi');
            text = text.replace(regex, myRoot);
            
            // 2. Replace root domain with our /c root
            // Covers: http://line.diatunnel.ink and https://line.diatunnel.ink
            const rootRegex = new RegExp(`https?://${UPSTREAM_HOST}`, 'gi');
            text = text.replace(rootRegex, myRoot);

            // 3. Extra safety for protocol-less URLs or "window.location" assignments
            // Covers: "line.diatunnel.ink/c" or "line.diatunnel.ink"
            const rawDomainRegex = new RegExp(UPSTREAM_HOST.replace('.', '\\.'), 'gi');
            // We only replace if it's NOT preceded by our own localhost (unlikely, but safe)
            // But rewriting "line.diatunnel.ink" -> "localhost:3000/c" in text might be risky for unrelated text.
            // Let's target specific JS patterns if needed. For now, the http/https regex should cover most.
            
            // However, let's catch "window.location = 'http://...'" if strictly matching
            // The regexes above cover it.
            
            // 4. Handle "window.location" explicitly if it uses a relative path that drifts
            // But <base> tag should handle relative paths.

            // Fix relative path issue in Stalker Portal JS
            // "../server/api" -> "server/api" (forces it to stay within /c/)
            text = text.replace(/\.\.\/server\/api/g, 'server/api');

            // Inject <base> tag to ensure relative assets load from /c/
            // and prevent "drifting" to root
            if (text.includes('<head>')) {
                 text = text.replace('<head>', `<head><base href="${myOrigin}/c/" />`);
            }
            
            responseBody = Buffer.from(text);
        } catch (e) {
            console.error('[Proxy] Error rewriting body:', e);
        }
    }

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('[Proxy] Error:', error.message);
    return new NextResponse(`Proxy Error: ${error.message}`, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: any) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: any) {
  return proxyRequest(request, context);
}
