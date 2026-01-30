import { NextResponse } from 'next/server';
import { getActiveUpstreamServer } from '@/lib/server_config';

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
    // 1. Get Upstream URL (Cached)
    const config = await getActiveUpstreamServer();

    if (!config) {
      return new NextResponse('No active upstream server', { status: 503 });
    }

    // 2. Construct Redirect URL
    // Standard Xtream: http://server:port/live/user/pass/id.ts
    // We preserve the incoming ID which likely includes .ts or .m3u8 extension
    let redirectUrl = `${config.server_url}/live/${username}/${password}/${stream_id}`;

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
