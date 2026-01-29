import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate file type (basic check)
    const validExtensions = ['.srt', '.vtt'];
    const ext = path.extname(file.name).toLowerCase();
    if (!validExtensions.includes(ext)) {
        return NextResponse.json({ error: 'Invalid file type. Only .srt and .vtt are allowed.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename to avoid collisions
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const filename = `${uniqueSuffix}${ext}`;
    
    // Save to public/subtitles
    // Note: In Docker with volume mount ./public:/app/public, this writes to host too.
    const uploadDir = path.join(process.cwd(), 'public', 'subtitles');
    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);

    // Return the public URL
    const publicUrl = `/subtitles/${filename}`;

    return NextResponse.json({ url: publicUrl }, { status: 201 });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed', details: error.message }, { status: 500 });
  }
}
