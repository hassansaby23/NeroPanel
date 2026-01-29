import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { z } from 'zod';

const localContentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  content_type: z.enum(['movie', 'series']),
  poster_url: z.string().url().optional().or(z.literal('')),
  stream_url: z.string().url(),
  category_id: z.string().optional(),
  category_name: z.string().optional(),
  stream_id: z.string().optional().or(z.literal('')), // Optional manual ID
  subtitle_url: z.string().optional().or(z.literal('')),
  season_num: z.number().optional(),
  episode_num: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  created_by: z.string().uuid().optional().or(z.literal('')), 
});

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT * FROM local_content ORDER BY created_at DESC'
    );
    return NextResponse.json(result.rows);
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Database Error', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = localContentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
    }

    const { 
        title, description, content_type, poster_url, stream_url, 
        category_id, category_name, stream_id, subtitle_url,
        season_num, episode_num, metadata, created_by 
    } = validation.data;

    // Treat empty string category_id as null
    const finalCategoryId = category_id || null;
    const finalCategoryName = category_name || null;
    const finalCreatedBy = created_by || null;
    const finalSubtitleUrl = subtitle_url || null;

    let finalStreamId = stream_id;
    if (!finalStreamId) {
        // Generate a random numeric stream_id (Xtream Codes compatible)
        const min = 100000;
        const max = 99999999;
        finalStreamId = Math.floor(Math.random() * (max - min + 1) + min).toString();
    }

    // LOGIC SPLIT: Movie vs Series
    if (content_type === 'movie') {
        // Just insert into local_content
        const result = await pool.query(
          `INSERT INTO local_content (
              title, description, content_type, poster_url, stream_url, 
              category_id, category_name, stream_id, subtitle_url, metadata, created_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [title, description, content_type, poster_url, stream_url, finalCategoryId, finalCategoryName, finalStreamId, finalSubtitleUrl, metadata, finalCreatedBy]
        );
        return NextResponse.json(result.rows[0], { status: 201 });
    } else {
        // Series Logic: Upsert Series Container -> Insert Episode
        
        // 1. Check if Series exists by Title
        let seriesId = null;
        const existingSeries = await pool.query(
            'SELECT id FROM local_content WHERE title = $1 AND content_type = $2 LIMIT 1',
            [title, 'series']
        );

        if (existingSeries.rowCount && existingSeries.rowCount > 0) {
            seriesId = existingSeries.rows[0].id;
        } else {
            // Create New Series Container
            // For container, stream_url is dummy or empty? We put the first episode's URL or just a placeholder.
            // But strict schema requires stream_url NOT NULL. We can put the episode URL there for now.
            // Also need a stream_id for the SERIES itself (Xtream needs series_id).
            const seriesStreamId = Math.floor(Math.random() * (99999999 - 100000 + 1) + 100000).toString();
            
            const newSeries = await pool.query(
                `INSERT INTO local_content (
                    title, description, content_type, poster_url, stream_url, 
                    category_id, category_name, stream_id, metadata, created_by
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING id`,
                [title, description, 'series', poster_url, stream_url, finalCategoryId, finalCategoryName, seriesStreamId, metadata, finalCreatedBy]
            );
            seriesId = newSeries.rows[0].id;
        }

        // 2. Insert Episode
        // Episode needs its own stream_id
        // If user provided a manual stream_id, use it for the EPISODE, not the series container (unless it was new)
        // Actually, if user provided `stream_id` in form, they probably meant the Episode ID if they are adding an episode.
        
        const episodeRes = await pool.query(
            `INSERT INTO local_episodes (
                series_id, season_num, episode_num, title, stream_url, stream_id, container_extension
             )
             VALUES ($1, $2, $3, $4, $5, $6, 'mp4')
             RETURNING *`,
            [
                seriesId, 
                season_num || 1, 
                episode_num || 1, 
                `S${season_num || 1} E${episode_num || 1}`, 
                stream_url, 
                finalStreamId 
            ]
        );
        
        return NextResponse.json(episodeRes.rows[0], { status: 201 });
    }

  } catch (error: any) {
    console.error('Database error:', error);
    if (error.code === '23505') { 
        return NextResponse.json({ error: 'Stream ID already exists. Please choose another one.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Database Error', details: error.message }, { status: 500 });
  }
}
