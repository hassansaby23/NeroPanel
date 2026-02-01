import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const nextUrl = request.nextUrl;
  console.log(`[Middleware] Request: ${request.method} ${nextUrl.pathname}`);

  // Skip middleware for static files and Next.js internals
  if (
    nextUrl.pathname.startsWith('/_next') ||
    nextUrl.pathname.startsWith('/static') ||
    nextUrl.pathname.startsWith('/api/auth') ||
    nextUrl.pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Allow specific paths without authentication
  const allowedPaths = [
    '/player_api.php',
    '/live/',
    '/timeshift/',
    '/movie/',
    '/series/',
    '/xmltv.php',
    '/api/',
    '/get.php',
    '/c',
    '/portal.php',
    '/test-portal'
  ];

  if (allowedPaths.some(path => nextUrl.pathname.startsWith(path))) {
    console.log(`[Middleware] Allowing: ${nextUrl.pathname}`);
    return NextResponse.next();
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
