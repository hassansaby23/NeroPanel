import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { z } from 'zod';

const toggleSchema = z.object({
  category_id: z.string(),
  category_name: z.string().optional(),
  is_hidden: z.boolean()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = toggleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
    }

    const { category_id, category_name, is_hidden } = validation.data;

    // Upsert the override
    await pool.query(
      `INSERT INTO category_overrides (category_id, category_name, is_hidden, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (category_id) 
       DO UPDATE SET 
         is_hidden = EXCLUDED.is_hidden,
         category_name = COALESCE(EXCLUDED.category_name, category_overrides.category_name),
         updated_at = NOW()`,
      [category_id, category_name || '', is_hidden]
    );

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Category Toggle Error:', error);
    return NextResponse.json({ error: 'Database Error' }, { status: 500 });
  }
}
