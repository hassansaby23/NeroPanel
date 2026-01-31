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

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const id = params.id;
    const body = await request.json();
    
    // We update fields provided in the body
    // For simplicity, we assume the body matches the structure we want to update.
    // Ideally we should reuse the Zod schema, but for partial updates let's be flexible or strict.
    // Let's allow updating: title, description, poster_url, stream_url, category_id, category_name, stream_id, subtitle_url, metadata
    
    const {
        title, description, poster_url, stream_url, 
        category_id, category_name, stream_id, subtitle_url, metadata
    } = body;

    // Check if content exists
    const checkRes = await pool.query('SELECT id FROM local_content WHERE id = $1', [id]);
    if (checkRes.rowCount === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const result = await pool.query(
        `UPDATE local_content SET
            title = COALESCE($1, title),
            description = COALESCE($2, description),
            poster_url = COALESCE($3, poster_url),
            stream_url = COALESCE($4, stream_url),
            category_id = COALESCE($5, category_id),
            category_name = COALESCE($6, category_name),
            stream_id = COALESCE($7, stream_id),
            subtitle_url = COALESCE($8, subtitle_url),
            metadata = COALESCE($9, metadata),
            updated_at = NOW()
         WHERE id = $10
         RETURNING *`,
        [title, description, poster_url, stream_url, category_id, category_name, stream_id, subtitle_url, metadata, id]
    );

    return NextResponse.json(result.rows[0]);

  } catch (error: any) {
    console.error('Update error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

export async function GET(
    request: Request,
    props: { params: Promise<{ id: string }> }
  ) {
    try {
      const params = await props.params;
      const id = params.id;
      
      const result = await pool.query('SELECT * FROM local_content WHERE id = $1', [id]);
      
      if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Content not found' }, { status: 404 });
      }
  
      return NextResponse.json(result.rows[0]);
    } catch (error: any) {
      console.error('Fetch error:', error);
      return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
  }
