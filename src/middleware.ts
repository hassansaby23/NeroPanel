import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()
  const hostname = request.headers.get('host') || ''
  
  // 1. Define the DNS/Host domain (from env or hardcoded logic)
  // Ideally this comes from ENV, but we can detect based on subdomains if needed.
  // For now, let's assume anything NOT the panel domain should be restricted.
  
  // If you set NEXT_PUBLIC_PANEL_DOMAIN in your env, we can use it.
  // Example: panel.yourdomain.com
  const panelDomain = process.env.NEXT_PUBLIC_PANEL_DOMAIN;

  // 2. Logic: If the request comes from the "DNS" domain (streaming), 
  // it should ONLY access /player_api.php, /c/, /xmltv.php, or /live /movie /series
  // It should NOT be able to see the Dashboard UI.
  
  // We check if the hostname matches the Panel Domain.
  // If panelDomain is set, and the current host is DIFFERENT, assume it's the DNS host.
  if (panelDomain && hostname !== panelDomain && !hostname.includes('localhost')) {
      const path = url.pathname;
      
      // Allowed paths for the DNS/Streaming host
      const allowedPaths = [
          '/player_api.php',
          '/c/',
          '/live/',
          '/movie/',
          '/series/',
          '/xmltv.php',
          '/api/' // Some internal APIs might be needed, but be careful
      ];
      
      const isAllowed = allowedPaths.some(p => path.startsWith(p));
      
      // If they try to access the Dashboard (/) or other UI pages, show 404 or specific message
      if (!isAllowed) {
           return new NextResponse('NeroPanel DNS Access - Unauthorized UI', { status: 403 });
      }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
