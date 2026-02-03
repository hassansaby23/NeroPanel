import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import httpClient from '@/lib/http_client';
import { getActiveUpstreamServer } from '@/lib/server_config';

// Helper (Duplicated from other files)
async function fetchUpstream(url: string, params: any) {
  try {
    const response = await httpClient.get(url, { 
      params, 
      timeout: 30000
    });
    return response.data;
  } catch (error: any) {
    console.error('Upstream Fetch Error:', error.message);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'live'; // live, vod, series

  try {
    // 1. Get Upstream Config (Cached)
    const config = await getActiveUpstreamServer();

    if (!config) {
      return NextResponse.json({ error: 'No active upstream server' }, { status: 404 });
    }

    const { server_url, username, password_hash } = config;
    let cleanUrl = server_url;
    // URL is already normalized in helper, but double check not needed if we trust helper


    // 2. Determine Action
    let action = 'get_live_categories';
    if (type === 'vod') action = 'get_vod_categories';
    if (type === 'series') action = 'get_series_categories';

    // 3. Parallel Fetch
    const [upstreamData, overridesRes] = await Promise.all([
      fetchUpstream(`${cleanUrl}/player_api.php`, {
        username,
        password: password_hash,
        action
      }),
      pool.query('SELECT category_id, category_name, is_hidden FROM category_overrides')
    ]);

    const upstreamItems = Array.isArray(upstreamData) ? upstreamData : [];
    
    // 4. Merge
    const overrideMap = new Map();
    overridesRes.rows.forEach(row => {
        overrideMap.set(row.category_id, row);
    });

    const categories = upstreamItems.map((item: any) => {
        const cid = item.category_id;
        const override = overrideMap.get(cid);
        
        return {
            category_id: cid,
            category_name: override?.category_name && override.category_name.trim() !== '' ? override.category_name : item.category_name,
            original_name: item.category_name,
            parent_id: item.parent_id || 0,
            is_hidden: override?.is_hidden || false
        };
    });

    return NextResponse.json(categories);

  } catch (error: any) {
    console.error('Category List Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
