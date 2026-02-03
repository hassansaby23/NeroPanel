import { NextResponse } from 'next/server';
import { getUpstreamForClient } from '@/lib/upstream_balancer';

interface Props {
  params: Promise<{
    username: string;
    password: string;
    stream_id: string;
  }>
}

export async function GET(
  request: Request,
  props: Props
) {
  const params = await props.params;
  const { username, password, stream_id } = params;

  try {
    // 1. Get Upstream URL (Rotated)
    const clientIp = request.headers.get('x-forwarded-for') || (request as any).ip || 'unknown';
    const upstreamUrl = getUpstreamForClient(clientIp);

    // 2. Construct Redirect URL
    // Standard Xtream: http://server:port/live/user/pass/id.ts
    // We preserve the incoming ID which likely includes .ts or .m3u8 extension
    let redirectUrl = `${upstreamUrl}/live/${username}/${password}/${stream_id}`;

    // Append query parameters (e.g. timeshift, token)
    const { search } = new URL(request.url);
    if (search) {
      redirectUrl += search;
    }

    // 3. Redirect
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('Live Redirect Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
