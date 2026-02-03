import { NextResponse } from 'next/server';
import { getUpstreamForClient } from '@/lib/upstream_balancer';

interface Props {
  params: Promise<{
    slug: string[];
  }>
}

export async function GET(
  request: Request,
  props: Props
) {
  const params = await props.params;
  const { slug } = params;

  try {
    // 1. Get Upstream URL (Rotated)
    const clientIp = request.headers.get('x-forwarded-for') || (request as any).ip || 'unknown';
    let upstreamUrl = getUpstreamForClient(clientIp);
    if (upstreamUrl.endsWith('/')) upstreamUrl = upstreamUrl.slice(0, -1);

    // 2. Construct Redirect URL
    // Standard Xtream: http://server:port/timeshift/user/pass/duration/start/id.ts
    // We join the slug array to reconstruct the path
    const path = slug.join('/');

    const redirectUrl = `${upstreamUrl}/timeshift/${path}`;
    
    // Preserve query parameters if any (though usually not used for timeshift stream URLs)
    const { search } = new URL(request.url);
    const finalUrl = search ? `${redirectUrl}${search}` : redirectUrl;

    console.log(`[Timeshift] Redirecting to: ${finalUrl}`);

    // 3. Redirect
    return NextResponse.redirect(finalUrl);

  } catch (error) {
    console.error('Timeshift Redirect Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
