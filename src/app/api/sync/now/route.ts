import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get('serverId');

    let query = 'SELECT * FROM upstream_servers WHERE is_active = true';
    let params: any[] = [];

    if (serverId) {
        query += ' AND id = $1';
        params.push(serverId);
    }

    // 1. Fetch Active Upstream Servers
    const servers = await pool.query(query, params);

    if (servers.rowCount === 0) {
        return NextResponse.json({ error: 'No active servers found to sync' }, { status: 404 });
    }

    let syncedCount = 0;

    for (const server of servers.rows) {
      const { id, server_url, username, password_hash: password } = server; 
      
      // If no creds, we can't sync (Xtream API needs auth to list all streams)
      if (!username || !password) {
          console.warn(`Skipping sync for ${server_url} - No credentials provided`);
          continue;
      }

      const apiUrl = `${server_url}/player_api.php`;

      try {
        // 2. Fetch VODs
        const vodRes = await axios.get(apiUrl, {
          params: { username, password, action: 'get_vod_streams' },
          timeout: 60000 // 60s timeout for sync
        });

        if (Array.isArray(vodRes.data)) {
           // Insert in batches or loop. Using simple loop for MVP.
           // In prod, use pg-copy-streams or massive insert.
           for (const item of vodRes.data) {
             // Upsert
             await pool.query(
               `INSERT INTO synced_content (upstream_server_id, stream_id, name, stream_type, stream_icon, stream_url, metadata)
                VALUES ($1, $2, $3, 'vod', $4, $5, $6)
                ON CONFLICT (upstream_server_id, stream_id) 
                DO UPDATE SET name = EXCLUDED.name, stream_icon = EXCLUDED.stream_icon, stream_url = EXCLUDED.stream_url, metadata = EXCLUDED.metadata, synced_at = NOW()`,
               [id, item.stream_id, item.name, item.stream_icon, item.direct_source || '', item]
             );
             syncedCount++;
           }
        }

        // 3. Fetch Series (Optional for MVP, but requested)
        const seriesRes = await axios.get(apiUrl, {
            params: { username, password, action: 'get_series' },
            timeout: 60000
        });

        if (Array.isArray(seriesRes.data)) {
            for (const item of seriesRes.data) {
                 await pool.query(
                   `INSERT INTO synced_content (upstream_server_id, stream_id, name, stream_type, stream_icon, stream_url, metadata)
                    VALUES ($1, $2, $3, 'series', $4, $5, $6)
                    ON CONFLICT (upstream_server_id, stream_id) 
                    DO UPDATE SET name = EXCLUDED.name, stream_icon = EXCLUDED.stream_icon, stream_url = EXCLUDED.stream_url, metadata = EXCLUDED.metadata, synced_at = NOW()`,
                   [id, item.series_id, item.name, item.cover, '', item]
                 );
                 syncedCount++;
            }
        }

        // Update last_sync_at
        await pool.query('UPDATE upstream_servers SET last_sync_at = NOW() WHERE id = $1', [id]);

      } catch (err: any) {
        console.error(`Sync failed for server ${server_url}:`, err.message);
        // Continue to next server
      }
    }

    return NextResponse.json({ success: true, message: `Synced ${syncedCount} items`, syncedItems: syncedCount });
  } catch (error) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
