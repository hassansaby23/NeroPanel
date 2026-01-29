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
    // 1. Get Upstream URL
    const serverRes = await pool.query(
      'SELECT server_url FROM upstream_servers WHERE is_active = true LIMIT 1'
    );

    if (!serverRes.rowCount || serverRes.rowCount === 0) {
      return new NextResponse('No active upstream server', { status: 503 });
    }

    let upstreamUrl = serverRes.rows[0].server_url;
    if (upstreamUrl.endsWith('/')) upstreamUrl = upstreamUrl.slice(0, -1);

    // 2. Construct Redirect URL
    // Standard Xtream: http://server:port/live/user/pass/id.ts
    // We preserve the incoming ID which likely includes .ts or .m3u8 extension
    const redirectUrl = `${upstreamUrl}/live/${username}/${password}/${stream_id}`;

    // 3. Redirect
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('Live Redirect Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
