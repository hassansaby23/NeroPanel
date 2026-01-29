import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const id = params.id;
    
    // Check if server exists
    const checkRes = await pool.query('SELECT id FROM upstream_servers WHERE id = $1', [id]);
    if (checkRes.rowCount === 0) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    // Delete server (Cascade will delete synced_content)
    await pool.query('DELETE FROM upstream_servers WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
