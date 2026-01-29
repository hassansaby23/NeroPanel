import { NextResponse } from 'next/server';
import axios from 'axios';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '73d2519f33d84184449e657fafca9352'; // Fallback to provided key
const BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type') || 'movie'; // movie or tv

  if (!TMDB_API_KEY) {
    return NextResponse.json({ error: 'TMDB_API_KEY is not set in .env' }, { status: 500 });
  }

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  try {
    const response = await axios.get(`${BASE_URL}/${type}/${id}`, {
      params: {
        api_key: TMDB_API_KEY,
        language: 'en-US',
        append_to_response: 'credits,videos,images'
      }
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('TMDB Details Error:', error.response?.data || error.message);
    return NextResponse.json({ error: 'Failed to fetch details from TMDB' }, { status: 500 });
  }
}
