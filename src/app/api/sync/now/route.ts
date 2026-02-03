import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios from 'axios';
import { PROVIDERS } from '@/lib/upstream_balancer';

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
      
      if (!username || !password) {
          console.warn(`Skipping sync for ${server_url} - No credentials provided`);
          continue;
      }

      // Try multiple providers if the main one fails
      // We start with the configured server_url, then try the rotation providers
      const urlsToTry = [server_url, ...PROVIDERS];
      // Deduplicate
      const uniqueUrls = Array.from(new Set(urlsToTry.map(u => u.replace(/\/$/, ''))));

      let vodData: any[] = [];
      let seriesData: any[] = [];
      let success = false;

      // 2. Fetch Data (Try loop)
      for (const baseUrl of uniqueUrls) {
          try {
              console.log(`[Sync] Trying to fetch from ${baseUrl}...`);
              const apiUrl = `${baseUrl}/player_api.php`;
              
              const [vRes, sRes] = await Promise.all([
                  axios.get(apiUrl, {
                      params: { username, password, action: 'get_vod_streams' },
                      timeout: 60000 
                  }),
                  axios.get(apiUrl, {
                      params: { username, password, action: 'get_series' },
                      timeout: 60000
                  })
              ]);

              if (Array.isArray(vRes.data)) vodData = vRes.data;
              if (Array.isArray(sRes.data)) seriesData = sRes.data;
              
              success = true;
              console.log(`[Sync] Successfully fetched data from ${baseUrl}`);
              break; // Stop trying if successful
          } catch (e: any) {
              console.warn(`[Sync] Failed to fetch from ${baseUrl}: ${e.message}`);
              // Continue to next url
          }
      }

      if (!success) {
          console.error(`[Sync] All providers failed for server ID ${id}`);
          continue; // Skip to next server in DB loop
      }

      // 3. Batch Insert VODs
      if (vodData.length > 0) {
          const BATCH_SIZE = 1000;
          for (let i = 0; i < vodData.length; i += BATCH_SIZE) {
              const batch = vodData.slice(i, i + BATCH_SIZE);
              const jsonBatch = JSON.stringify(batch);
              
              await pool.query(`
                  INSERT INTO synced_content (upstream_server_id, stream_id, name, stream_type, stream_icon, stream_url, metadata)
                  SELECT 
                      $1, 
                      (elem->>'stream_id')::text, 
                      elem->>'name', 
                      'vod', 
                      elem->>'stream_icon', 
                      COALESCE(elem->>'direct_source', ''), 
                      elem
                  FROM jsonb_array_elements($2::jsonb) AS elem
                  ON CONFLICT (upstream_server_id, stream_id) 
                  DO UPDATE SET 
                      name = EXCLUDED.name, 
                      stream_icon = EXCLUDED.stream_icon, 
                      stream_url = EXCLUDED.stream_url, 
                      metadata = EXCLUDED.metadata, 
                      synced_at = NOW()
              `, [id, jsonBatch]);
              
              syncedCount += batch.length;
          }
      }

      // 4. Batch Insert Series
      if (seriesData.length > 0) {
          const BATCH_SIZE = 1000;
          for (let i = 0; i < seriesData.length; i += BATCH_SIZE) {
              const batch = seriesData.slice(i, i + BATCH_SIZE);
              const jsonBatch = JSON.stringify(batch);
              
              await pool.query(`
                  INSERT INTO synced_content (upstream_server_id, stream_id, name, stream_type, stream_icon, stream_url, metadata)
                  SELECT 
                      $1, 
                      (elem->>'series_id')::text, 
                      elem->>'name', 
                      'series', 
                      elem->>'cover', 
                      '', 
                      elem
                  FROM jsonb_array_elements($2::jsonb) AS elem
                  ON CONFLICT (upstream_server_id, stream_id) 
                  DO UPDATE SET 
                      name = EXCLUDED.name, 
                      stream_icon = EXCLUDED.stream_icon, 
                      stream_url = EXCLUDED.stream_url, 
                      metadata = EXCLUDED.metadata, 
                      synced_at = NOW()
              `, [id, jsonBatch]);
              
              syncedCount += batch.length;
          }
      }

      // Update last_sync_at
      await pool.query('UPDATE upstream_servers SET last_sync_at = NOW() WHERE id = $1', [id]);
    }

    return NextResponse.json({ success: true, message: `Synced ${syncedCount} items`, syncedItems: syncedCount });
  } catch (error: any) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: 'Internal Server Error: ' + error.message }, { status: 500 });
  }
}
