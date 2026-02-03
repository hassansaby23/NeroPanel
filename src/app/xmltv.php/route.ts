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

    console.log(`[XMLTV] Fetching EPG from ${upstreamUrl}/xmltv.php`);

    const response = await httpClient.get(`${upstreamUrl}/xmltv.php`, {
      params: { username, password },
      responseType: 'arraybuffer', // Use arraybuffer to preserve encoding
      timeout: 120000 // 2 minutes timeout
    });

    const headers = new Headers();
    headers.set('Content-Type', response.headers['content-type'] || 'application/xml');
    if (response.headers['content-disposition']) {
        headers.set('Content-Disposition', response.headers['content-disposition']);
    } else {
        headers.set('Content-Disposition', 'attachment; filename="epg.xml"');
    }

    return new NextResponse(response.data, {
      status: 200,
      headers
    });

  } catch (error: any) {
    console.error('[XMLTV] Error:', error.message);
    return new NextResponse('Failed to fetch EPG', { status: 500 });
  }
}
