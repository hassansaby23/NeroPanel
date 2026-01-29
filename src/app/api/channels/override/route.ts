import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { z } from 'zod';

const overrideSchema = z.object({
  stream_id: z.number(),
  logo_url: z.string().nullable().optional(),
  custom_name: z.string().nullable().optional()
});

const bulkSchema = z.array(overrideSchema);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Check if array (Bulk)
    if (Array.isArray(body)) {
        const validation = bulkSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            for (const item of validation.data) {
                await client.query(
                    `INSERT INTO channel_overrides (stream_id, logo_url, custom_name, updated_at)
                     VALUES ($1, $2, $3, NOW())
                     ON CONFLICT (stream_id) 
                     DO UPDATE SET 
                       logo_url = COALESCE($2, channel_overrides.logo_url),
                       custom_name = COALESCE($3, channel_overrides.custom_name),
                       updated_at = NOW()`,
                    [item.stream_id, item.logo_url || null, item.custom_name || null]
                );
            }

            await client.query('COMMIT');
            return NextResponse.json({ success: true, count: validation.data.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Single Update
    const validation = overrideSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
    }

    const { stream_id, logo_url, custom_name } = validation.data;

    // Upsert the override
    await pool.query(
      `INSERT INTO channel_overrides (stream_id, logo_url, custom_name, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (stream_id) 
       DO UPDATE SET 
         logo_url = EXCLUDED.logo_url,
         custom_name = EXCLUDED.custom_name,
         updated_at = NOW()`,
      [stream_id, logo_url || null, custom_name || null]
    );

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Override Save Error:', error);
    return NextResponse.json({ error: 'Database Error' }, { status: 500 });
  }
}
