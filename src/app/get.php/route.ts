import { NextResponse } from 'next/server';
import httpClient from '@/lib/http_client';
import { getUpstreamForClient } from '@/lib/upstream_balancer';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const password = searchParams.get('password');
  
  if (!username || !password) {
    return new NextResponse('Missing credentials', { status: 401 });
  }

  try {
    const clientIp = request.headers.get('x-forwarded-for') || (request as any).ip || 'unknown';
    let upstreamUrl = getUpstreamForClient(clientIp);
    if (upstreamUrl.endsWith('/')) upstreamUrl = upstreamUrl.slice(0, -1);
    
    // Force HTTPS
    if (upstreamUrl.startsWith('http://') && !upstreamUrl.includes('diatunnel.ink')) {
        upstreamUrl = upstreamUrl.replace('http://', 'https://');
    }

    console.log(`[M3U] Fetching playlist from ${upstreamUrl}/get.php`);

    const response = await httpClient.get(`${upstreamUrl}/get.php`, {
      params: Object.fromEntries(searchParams), // Forward all params
      timeout: 120000,
      responseType: 'text' // Important for M3U
    });

    let m3uContent = response.data;
    
    // Replace Upstream URL with Our URL
    // We need to construct our base URL.
    // Since we are in a server component, we can use the request headers.
    const host = request.headers.get('host') || 'localhost';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const myBaseUrl = `${protocol}://${host}`;

    // We also handle cases where upstream might use different ports in the M3U if possible, 
    // but primarily we target the configured upstream URL.
    
    // Escape special chars for regex
    const escapeRegExp = (string: string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
    };

    const upstreamRegex = new RegExp(escapeRegExp(upstreamUrl), 'g');
    m3uContent = m3uContent.replace(upstreamRegex, myBaseUrl);

    return new NextResponse(m3uContent, {
      status: 200,
      headers: {
        'Content-Type': 'audio/x-mpegurl',
        'Content-Disposition': 'attachment; filename="playlist.m3u"',
      }
    });

  } catch (error: any) {
    console.error('[M3U] Error:', error.message);
    return new NextResponse('Failed to fetch playlist', { status: 500 });
  }
}
