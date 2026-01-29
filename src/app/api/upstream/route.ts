import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { z } from 'zod';

const upstreamServerSchema = z.object({
  server_url: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  timeout_seconds: z.number().min(5).max(300).default(30),
});

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT id, server_url, username, is_active, timeout_seconds, last_sync_at, created_at FROM upstream_servers ORDER BY created_at DESC'
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = upstreamServerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
    }

    const { server_url, username, password, timeout_seconds } = validation.data;

    // Use empty string or null for optional fields
    const finalUsername = username || null;
    const finalPassword = password || null;

    const result = await pool.query(
      `INSERT INTO upstream_servers (server_url, username, password_hash, timeout_seconds)
       VALUES ($1, $2, $3, $4)
       RETURNING id, server_url, username, created_at`,
      [server_url, finalUsername, finalPassword, timeout_seconds]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: any) {
    console.error('Database error:', error);
    if (error.code === '23505') { // Unique violation
      return NextResponse.json({ error: 'Server URL already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
