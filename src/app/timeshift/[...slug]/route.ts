import { NextResponse } from 'next/server';
import { getActiveUpstreamServer } from '@/lib/server_config';

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
    // 1. Get Upstream URL (Cached)
    const config = await getActiveUpstreamServer();

    if (!config) {
      return new NextResponse('No active upstream server', { status: 503 });
    }

    // 2. Construct Redirect URL
    // Standard Xtream: http://server:port/timeshift/user/pass/duration/start/id.ts
    // We join the slug array to reconstruct the path
    const path = slug.join('/');
    
    // Ensure the upstream URL doesn't have a trailing slash
    let serverUrl = config.server_url;
    if (serverUrl.endsWith('/')) {
        serverUrl = serverUrl.slice(0, -1);
    }

    const redirectUrl = `${serverUrl}/timeshift/${path}`;
    
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
