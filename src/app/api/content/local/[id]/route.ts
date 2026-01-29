import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const id = params.id;
    
    // Check if content exists
    const checkRes = await pool.query('SELECT id FROM local_content WHERE id = $1', [id]);
    if (checkRes.rowCount === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // Delete content
    await pool.query('DELETE FROM local_content WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
