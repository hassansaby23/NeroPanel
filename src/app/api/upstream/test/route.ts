import { NextResponse } from 'next/server';
import axios from 'axios';
import { z } from 'zod';

const testSchema = z.object({
  serverUrl: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = testSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
    }

    const { serverUrl, username, password } = validation.data;

    // Construct Xtream API URL
    // Standard Xtream API: http://url/player_api.php?username=...&password=...
    const apiUrl = `${serverUrl}/player_api.php`;

    try {
      // If we have creds, try full auth. If not, just ping the endpoint to see if it exists (might return 401 or empty json)
      const params: any = {};
      if (username) params.username = username;
      if (password) params.password = password;

      const response = await axios.get(apiUrl, {
        params,
        timeout: 10000, // 10s timeout for test
        validateStatus: () => true, // Accept any status code, don't throw error
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': '*/*'
        }
      });

      // Case 1: Full Auth Success (user/pass provided)
      if (username && password && response.data && response.data.user_info && response.data.user_info.auth === 1) {
         return NextResponse.json({
            success: true,
            message: 'Connection successful (Authenticated)',
            serverInfo: response.data.server_info,
            userInfo: response.data.user_info
         });
      }
      
      // Case 2: URL Reachable but Auth Failed (or no creds provided)
      // Xtream panels often return 200 OK with empty JSON or "auth: 0" if creds are wrong/missing.
      // Cloudflare often returns 520, 521, 403 etc.
      // If we get ANY response (even 404, 401, 520), it means the server IS there and we connected.
      // We should only fail if it's a network error (DNS, timeout).
      
      return NextResponse.json({
        success: true,
        message: `Server is reachable (Status: ${response.status})`,
        serverInfo: { url: serverUrl, status: response.status } 
      });

    } catch (axiosError: any) {
      console.error('Upstream error:', axiosError.message);
      return NextResponse.json({
        success: false,
        message: 'Failed to connect to upstream server',
        error: axiosError.message
      });
    }

  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
