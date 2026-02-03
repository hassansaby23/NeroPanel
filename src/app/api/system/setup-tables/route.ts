import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('[System] Running manual schema migration...');
    
    // Create upstream_categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS upstream_categories (
          category_id VARCHAR(50) NOT NULL,
          category_name VARCHAR(255) NOT NULL,
          category_type VARCHAR(20) NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          PRIMARY KEY (category_id, category_type)
      );
    `);
    
    // Create index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_upstream_categories_name ON upstream_categories(category_name);
    `);

    // Ensure local_episodes exists as well (safety check)
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
    `);
    
    // Create indexes for local_episodes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_local_episodes_series ON local_episodes(series_id);
      CREATE INDEX IF NOT EXISTS idx_local_episodes_stream_id ON local_episodes(stream_id);
    `);

    console.log('[System] Migration completed successfully.');
    return NextResponse.json({ success: true, message: 'Schema updated: upstream_categories table created.' });
  } catch (error: any) {
    console.error('[System] Migration failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
