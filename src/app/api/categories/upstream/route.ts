import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios from 'axios';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'movie'; // 'movie' or 'series'

  try {
    // 1. Get Active Upstream Server
    const serverRes = await pool.query(
      'SELECT server_url, username, password_hash FROM upstream_servers WHERE is_active = true LIMIT 1'
    );

    if (serverRes.rowCount === 0) {
      return NextResponse.json([]); // No upstream, return empty list (or maybe we should return local categories if we had them)
    }

    const { server_url, username, password_hash: password } = serverRes.rows[0];
    
    // If router mode (no creds), we can't fetch categories
    if (!username || !password) {
        return NextResponse.json([]);
    }

    const action = type === 'series' ? 'get_series_categories' : 'get_vod_categories';
    const apiUrl = `${server_url}/player_api.php`;

    // 2. Fetch from Upstream
    const response = await axios.get(apiUrl, {
      params: {
        username,
        password,
        action
      },
      timeout: 10000
    });

    if (Array.isArray(response.data)) {
        return NextResponse.json(response.data);
    } else {
        return NextResponse.json([]);
    }

  } catch (error) {
    console.error('Category Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}
