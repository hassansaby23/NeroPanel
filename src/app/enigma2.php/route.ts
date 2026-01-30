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

    console.log(`[Enigma2] Fetching from ${upstreamUrl}/enigma2.php`);

    const response = await axios.get(`${upstreamUrl}/enigma2.php`, {
      params: Object.fromEntries(searchParams),
      responseType: 'text', // Enigma2 usually returns XML or similar text
      timeout: 120000, 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    // Replace Upstream URL with Our URL
    const host = request.headers.get('host') || 'localhost';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const myBaseUrl = `${protocol}://${host}`;

    let content = response.data;
    
    const escapeRegExp = (string: string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
    };

    const upstreamRegex = new RegExp(escapeRegExp(upstreamUrl), 'g');
    content = content.replace(upstreamRegex, myBaseUrl);

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml', // Enigma2 is usually XML
        'Content-Disposition': 'attachment; filename="bouquet.tv"',
      }
    });

  } catch (error: any) {
    console.error('[Enigma2] Error:', error.message);
    return new NextResponse('Failed to fetch Enigma2 playlist', { status: 500 });
  }
}
