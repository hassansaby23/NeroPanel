import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CurlOptions {
    params?: Record<string, string>;
    headers?: Record<string, string>;
    timeout?: number;
}

export async function curlRequest(url: string, options: CurlOptions = {}): Promise<any> {
    // Construct URL with params
    let fullUrl = url;
    if (options.params) {
        const usp = new URLSearchParams(options.params);
        fullUrl += (url.includes('?') ? '&' : '?') + usp.toString();
    }

    // Build default headers
    // Mimic standard curl (no User-Agent or default curl UA) to match successful manual tests
    const headers: Record<string, string> = {
        'Accept': '*/*',
        ...(options.headers || {})
    };

    // If User-Agent is explicitly set to null/undefined in options, don't send it.
    // Otherwise, if not provided, don't set it (let curl use default).
    // If provided in options, use it.
    
    // Construct Header String
    const headerArgs = Object.entries(headers)
        .map(([key, value]) => `-H "${key}: ${value}"`)
        .join(' ');

    // Timeout (default 15s)
    const timeout = options.timeout ? Math.ceil(options.timeout / 1000) : 15;

    // Proxy Configuration
    const proxy = process.env.UPSTREAM_PROXY; // e.g., http://user:pass@host:port or socks5://...
    const proxyArg = proxy ? `--proxy "${proxy}"` : '';

    // Build Command
    // -s: Silent
    // -L: Follow redirects
    // --insecure: Skip SSL verification
    // --max-time: Timeout
    // -w "%{http_code}": Capture status code at the end
    const command = `curl -s -L --insecure --max-time ${timeout} ${proxyArg} ${headerArgs} -w "\\n%{http_code}" "${fullUrl}"`;

    console.log(`[Curl] Executing: ${command.replace(/password=[^"&]*/, 'password=***').replace(/--proxy "[^"]+"/, '--proxy "***"')}`); 

    try {
        const { stdout, stderr } = await execAsync(command, { maxBuffer: 50 * 1024 * 1024 }); // Increase buffer to 50MB
        
        if (!stdout) {
             console.warn(`[Curl] Empty response. Stderr: ${stderr}`);
             return null;
        }

        // Separate body and status code
        const lastNewLine = stdout.lastIndexOf('\n');
        let body = stdout;
        let statusCode = 200;

        if (lastNewLine !== -1) {
            const codeStr = stdout.substring(lastNewLine + 1).trim();
            if (/^\d{3}$/.test(codeStr)) {
                statusCode = parseInt(codeStr, 10);
                body = stdout.substring(0, lastNewLine);
            }
        }

        if (statusCode >= 400) {
            throw new Error(`Request failed with status code ${statusCode}`);
        }

        try {
            return JSON.parse(body);
        } catch (e) {
            console.warn(`[Curl] Failed to parse JSON. Status: ${statusCode}. Body: ${body.substring(0, 100)}...`);
            return body;
        }

    } catch (error: any) {
        console.error(`[Curl] Error: ${error.message}`);
        throw error;
    }
}
