import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS local_episodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        series_id UUID REFERENCES local_content(id) ON DELETE CASCADE,
        season_num INTEGER NOT NULL,
        episode_num INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        stream_url TEXT NOT NULL,
        stream_id VARCHAR(100) UNIQUE NOT NULL,
        container_extension VARCHAR(10) DEFAULT 'mp4',
        duration VARCHAR(20) DEFAULT '00:00:00',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_local_episodes_series ON local_episodes(series_id);
      CREATE INDEX IF NOT EXISTS idx_local_episodes_stream_id ON local_episodes(stream_id);
    `);
    return NextResponse.json({ success: true, message: 'local_episodes table created' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
