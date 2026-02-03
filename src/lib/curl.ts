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
    const headers = {
        'User-Agent': 'IPTVSmartersPro',
        'Accept': '*/*',
        ...(options.headers || {})
    };

    // Construct Header String
    const headerArgs = Object.entries(headers)
        .map(([key, value]) => `-H "${key}: ${value}"`)
        .join(' ');

    // Timeout (default 15s)
    const timeout = options.timeout ? Math.ceil(options.timeout / 1000) : 15;

    // Build Command
    // -s: Silent
    // -L: Follow redirects
    // --insecure: Skip SSL verification (optional, but helpful for some IPTV providers)
    // --max-time: Timeout
    const command = `curl -s -L --insecure --max-time ${timeout} ${headerArgs} "${fullUrl}"`;

    console.log(`[Curl] Executing: ${command.replace(/password=[^"&]*/, 'password=***')}`); // Mask password in logs

    try {
        const { stdout, stderr } = await execAsync(command);
        
        if (!stdout) {
             console.warn(`[Curl] Empty response. Stderr: ${stderr}`);
             return null;
        }

        try {
            return JSON.parse(stdout);
        } catch (e) {
            // If response is not JSON, return raw text or handle error
            // Some IPTV panels return empty string on failure
            console.warn(`[Curl] Failed to parse JSON. Response: ${stdout.substring(0, 100)}...`);
            return stdout;
        }

    } catch (error: any) {
        console.error(`[Curl] Error: ${error.message}`);
        throw error;
    }
}
