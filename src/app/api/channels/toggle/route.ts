import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { z } from 'zod';

const toggleSchema = z.object({
  stream_id: z.number(),
  is_hidden: z.boolean()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = toggleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
    }

    const { stream_id, is_hidden } = validation.data;

    // Upsert the override (preserving other fields if they exist, or creating new row)
    await pool.query(
      `INSERT INTO channel_overrides (stream_id, is_hidden, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (stream_id) 
       DO UPDATE SET 
         is_hidden = EXCLUDED.is_hidden,
         updated_at = NOW()`,
      [stream_id, is_hidden]
    );

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Channel Toggle Error:', error);
    return NextResponse.json({ error: 'Database Error' }, { status: 500 });
  }
}
