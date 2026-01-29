import { NextResponse } from 'next/server';
import axios from 'axios';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '73d2519f33d84184449e657fafca9352'; // Fallback to provided key
const BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const type = searchParams.get('type') || 'movie'; // movie or tv

  if (!TMDB_API_KEY) {
    return NextResponse.json({ error: 'TMDB_API_KEY is not set in .env' }, { status: 500 });
  }

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`);
    
    if (!res.ok) {
        throw new Error(`TMDB responded with ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data.results);
  } catch (error: any) {
    console.error('TMDB Search Error:', error.message);
    return NextResponse.json({ 
        error: 'Server-side search failed. Please use client-side search.',
        details: error.message 
    }, { status: 502 });
  }
}
