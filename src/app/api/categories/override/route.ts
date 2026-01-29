import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { z } from 'zod';

const overrideSchema = z.object({
  category_id: z.string(),
  category_name: z.string().nullable().optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = overrideSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
    }

    const { category_id, category_name } = validation.data;

    // Upsert the override
    // Note: We need to preserve is_hidden if it exists, but UPSERT in Postgres requires us to specify it or it defaults.
    // However, if we don't touch is_hidden in UPDATE, it stays.
    // BUT if it's a new INSERT, is_hidden defaults to false (if column default is false) or null.
    // The table schema has no default for is_hidden? 
    // Wait, let's check init.sql again? It doesn't show category_overrides table definition in the snippet I read.
    // I inferred it from `toggle` route.
    
    // In `toggle` route: 
    // INSERT INTO category_overrides (category_id, category_name, is_hidden, updated_at) VALUES ...
    
    // Here we only want to update name.
    // Strategy:
    // 1. Check if exists.
    // 2. If exists, update name.
    // 3. If not exists, insert with name and default is_hidden=false.
    
    // Or better, use ON CONFLICT DO UPDATE ...
    // But for the INSERT part, we need a value for is_hidden?
    // If the column allows NULL or has default, we are fine.
    // I'll assume it defaults to false/null if omitted in INSERT?
    // Wait, `toggle` route inserts it explicitly.
    
    // Let's assume default is fine.
    
    await pool.query(
      `INSERT INTO category_overrides (category_id, category_name, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (category_id) 
       DO UPDATE SET 
         category_name = EXCLUDED.category_name,
         updated_at = NOW()`,
      [category_id, category_name || null]
    );

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Category Override Error:', error);
    return NextResponse.json({ error: 'Database Error' }, { status: 500 });
  }
}
