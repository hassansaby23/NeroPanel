import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Create local_episodes table if it doesn't exist
      await client.query(`
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

      // 2. Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_local_episodes_series ON local_episodes(series_id);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_local_episodes_stream_id ON local_episodes(stream_id);
      `);

      // 3. Ensure columns exist (for existing tables)
      await client.query(`
        ALTER TABLE local_episodes 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      `);

      await client.query('COMMIT');
      
      return NextResponse.json({ 
        success: true, 
        message: 'Database schema repaired successfully. local_episodes table is ready.' 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Schema Fix Failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      detail: 'Check server logs for more info'
    }, { status: 500 });
  }
}
