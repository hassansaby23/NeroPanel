import pool from './db';

// Simple in-memory cache to avoid redis roundtrip for very hot data
let memoryCache: {
    data: any;
    timestamp: number;
} | null = null;

const CACHE_TTL = 60 * 1000; // 1 minute

export interface UpstreamConfig {
    server_url: string;
    username?: string;
    password_hash?: string;
    is_active: boolean;
}

export async function getActiveUpstreamServer(): Promise<UpstreamConfig | null> {
    // 1. Check Memory Cache
    if (memoryCache && (Date.now() - memoryCache.timestamp < CACHE_TTL)) {
        return memoryCache.data;
    }

    // 2. Fetch from DB (We could add Redis layer here too, but memory is faster for this specific global config)
    try {
        const res = await pool.query(
            'SELECT server_url, username, password_hash, is_active FROM upstream_servers WHERE is_active = true LIMIT 1'
        );

        if (res.rowCount === 0) {
            return null;
        }

        const config = res.rows[0];
        
        // Normalize URL
        if (config.server_url.endsWith('/')) {
            config.server_url = config.server_url.slice(0, -1);
        }

        // Update Cache
        memoryCache = {
            data: config,
            timestamp: Date.now()
        };

        return config;
    } catch (error) {
        console.error("Failed to fetch upstream config", error);
        return null;
    }
}
