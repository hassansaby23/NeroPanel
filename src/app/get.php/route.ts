import { NextResponse } from 'next/server';
import axios from 'axios';
import { getActiveUpstreamServer } from '@/lib/server_config';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const password = searchParams.get('password');
  
  if (!username || !password) {
    return new NextResponse('Missing credentials', { status: 401 });
  }

  try {
    const config = await getActiveUpstreamServer();
    if (!config) {
      return new NextResponse('No upstream server configured', { status: 503 });
    }

    let upstreamUrl = config.server_url;
    if (upstreamUrl.endsWith('/')) upstreamUrl = upstreamUrl.slice(0, -1);

    console.log(`[M3U] Fetching playlist from ${upstreamUrl}/get.php`);

    const response = await axios.get(`${upstreamUrl}/get.php`, {
      params: Object.fromEntries(searchParams), // Forward all params (type, output, etc.)
      responseType: 'text',
      timeout: 120000, // 2 minutes
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    // Replace Upstream URL with Our URL
    // We need to construct our base URL.
    // Since we are in a server component, we can use the request headers.
    const host = request.headers.get('host') || 'localhost';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const myBaseUrl = `${protocol}://${host}`;

    let m3uContent = response.data;
    
    // Global replace of the upstream URL with our URL
    // We try to replace the upstream base URL found in config
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
