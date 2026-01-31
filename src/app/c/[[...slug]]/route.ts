import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios from 'axios';
import { getActiveUpstreamServer } from '@/lib/server_config';

export async function GET(request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
    return handleRequest(request, params);
}

export async function POST(request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
    return handleRequest(request, params);
}

async function handleRequest(request: Request, params: Promise<{ slug?: string[] }>) {
    // Get the path relative to /c/
    const { slug } = await params;
    
    // Handle root /c request - Redirect to server.php
    if (!slug || slug.length === 0) {
        const url = new URL(request.url);
        const searchParams = url.searchParams.toString();
        const host = request.headers.get('host') || url.host;
        const protocol = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
        
        const targetUrl = `${protocol}://${host}/c/server.php${searchParams ? '?' + searchParams : ''}`;
        return NextResponse.redirect(targetUrl);
    }

    const path = slug.join('/');
    
    // We only care about static files usually (js, css, images)
    // But let's proxy EVERYTHING we don't handle locally to the upstream.
    
    try {
        const config = await getActiveUpstreamServer();
        let upstreamUrl = config?.server_url || '';
        // Helper already handles trailing slash, but just in case
        if (upstreamUrl.endsWith('/')) upstreamUrl = upstreamUrl.slice(0, -1);
        
        // Construct upstream URL
        // Incoming: /c/version.js -> Upstream: /c/version.js
        // Incoming: /c/xpcom.common.js -> Upstream: /c/xpcom.common.js
        
        // Note: Our catch-all is at /c/[...slug], so "version.js" is slug[0]
        const targetUrl = `${upstreamUrl}/c/${path}`;
        
        console.log(`[Static Proxy] Fetching: ${targetUrl}`);

        const method = request.method;
        let requestBody = null;
        if (method !== 'GET' && method !== 'HEAD') {
            try {
                requestBody = await request.arrayBuffer();
            } catch (e) {
                console.warn('Could not read request body', e);
            }
        }

        const proxyRes = await axios({
            method: method,
            url: targetUrl,
            data: requestBody,
            responseType: 'arraybuffer', // Important for binary/text
            headers: {
                'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0',
                'Content-Type': request.headers.get('content-type') || 'application/octet-stream',
            },
            validateStatus: () => true
        });

        console.log(`[Static Proxy] Response: ${proxyRes.status}`);

        const headers = new Headers();
        
        // Copy relevant headers
        const allowedHeaders = [
            'content-type', 'content-length', 'last-modified', 'etag', 
            'cache-control', 'expires', 'date', 'server', 'pragma'
        ];
        
        Object.keys(proxyRes.headers).forEach(key => {
            if (allowedHeaders.includes(key.toLowerCase())) {
                 headers.set(key, proxyRes.headers[key]);
            }
        });

        // Ensure we send a Server header if missing (STBs like it)
        if (!headers.has('server')) {
            headers.set('Server', 'Apache/2.4.41 (Ubuntu)'); // Fake it to look like a standard Stalker server
        }

        // Forward Cookies
        if (proxyRes.headers['set-cookie']) {
            proxyRes.headers['set-cookie'].forEach((cookieStr: string) => {
                headers.append('Set-Cookie', cookieStr);
            });
        }
        
        return new NextResponse(proxyRes.data, {
            status: proxyRes.status,
            headers
        });

    } catch (error) {
        console.error(`[Static Proxy] Error fetching ${path}:`, error);
        return new NextResponse('', { status: 404 });
    }
}
