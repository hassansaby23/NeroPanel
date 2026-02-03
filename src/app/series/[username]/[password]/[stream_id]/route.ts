import { NextResponse } from 'next/server';
import pool from '@/lib/db';
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
    // 1. Check if it's a Local Episode (by stream_id)
    const cleanId = stream_id.replace(/\.[^/.]+$/, "");
    
    // Check local_episodes table first
    const episodeRes = await pool.query(
        'SELECT stream_url FROM local_episodes WHERE stream_id = $1',
        [cleanId]
    );

    if (episodeRes.rowCount && episodeRes.rowCount > 0) {
        const targetUrl = episodeRes.rows[0].stream_url;
        return NextResponse.redirect(targetUrl);
    }
    
    // Legacy Check: Check if it's a Local Series Container (starts with loc_)
    if (stream_id.startsWith('loc_')) {
        const localId = stream_id.replace('loc_', '').replace(/\.[^/.]+$/, "");
        const localRes = await pool.query(
            'SELECT stream_url FROM local_content WHERE id = $1',
            [localId]
        );

        if (localRes.rowCount && localRes.rowCount > 0) {
             const targetUrl = localRes.rows[0].stream_url;
             return NextResponse.redirect(targetUrl);
        }
    }

    // 2. Get Upstream URL (Rotated)
    const clientIp = request.headers.get('x-forwarded-for') || (request as any).ip || 'unknown';
    let upstreamUrl = getUpstreamForClient(clientIp);
    if (upstreamUrl.endsWith('/')) upstreamUrl = upstreamUrl.slice(0, -1);

    // 3. Construct Redirect URL
    let redirectUrl = `${upstreamUrl}/series/${username}/${password}/${stream_id}`;

    // Append query parameters
    const { search } = new URL(request.url);
    if (search) {
      redirectUrl += search;
    }

    // 4. Redirect
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('Series Redirect Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
