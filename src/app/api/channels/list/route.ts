import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios from 'axios';

// Helper (Duplicated from player_api but simplified)
async function fetchUpstream(url: string, params: any) {
  try {
    const response = await axios.get(url, { 
      params, 
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Upstream Fetch Error:', error.message);
    return null;
  }
}

export async function GET() {
  try {
    // 1. Get Upstream Config
    const serverRes = await pool.query(
      'SELECT server_url, username, password_hash FROM upstream_servers WHERE is_active = true LIMIT 1'
    );

    if (serverRes.rowCount === 0) {
      return NextResponse.json({ error: 'No active upstream server' }, { status: 404 });
    }

    const { server_url, username, password_hash } = serverRes.rows[0];

    if (!username || !password_hash) {
      return NextResponse.json({ 
        error: 'Manager Mode Required. Please edit the upstream server and add Username/Password to manage channels.' 
      }, { status: 403 });
    }

    let cleanUrl = server_url;
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);

    // 2. Parallel Fetch
    const [upstreamData, overridesRes] = await Promise.all([
      fetchUpstream(`${cleanUrl}/player_api.php`, {
        username,
        password: password_hash,
        action: 'get_live_streams'
      }),
      pool.query('SELECT stream_id, logo_url, custom_name, is_hidden FROM channel_overrides')
    ]);

    if (!Array.isArray(upstreamData)) {
      return NextResponse.json({ error: 'Failed to fetch from upstream (Invalid response)' }, { status: 502 });
    }

    // 3. Merge
    const overrideMap = new Map();
    overridesRes.rows.forEach(row => {
        overrideMap.set(Number(row.stream_id), row);
    });

    const channels = upstreamData.map((item: any) => {
        const sid = Number(item.stream_id);
        const override = overrideMap.get(sid);
        
        return {
            stream_id: sid,
            num: item.num,
            name: item.name,
            stream_icon: item.stream_icon,
            epg_channel_id: item.epg_channel_id || null, // Add EPG ID from upstream
            // Override fields
            custom_name: override?.custom_name || null,
            custom_logo: override?.logo_url || null,
            is_hidden: override?.is_hidden || false,
            // Final display values
            display_name: override?.custom_name || item.name,
            display_logo: override?.logo_url || item.stream_icon
        };
    });

    return NextResponse.json(channels);

  } catch (error: any) {
    console.error('Channel List Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
