import { NextResponse } from 'next/server';
import pool from '@/lib/db';

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

    // 2. Get Upstream URL
    const serverRes = await pool.query(
      'SELECT server_url FROM upstream_servers WHERE is_active = true LIMIT 1'
    );

    if (!serverRes.rowCount || serverRes.rowCount === 0) {
      return new NextResponse('No active upstream server', { status: 503 });
    }

    let upstreamUrl = serverRes.rows[0].server_url;
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
