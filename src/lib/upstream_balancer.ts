export const PROVIDERS = [
    'http://hit.hostner.cc',
    'http://red.openrono.cc',
    'http://like.ewforo.cc',
    'http://line.ernoro.cc',
    'http://line.diatunnel.ink'
];

/**
 * Selects a sticky upstream provider based on the client's identifier (IP).
 * This ensures the same client always gets the same server, preserving session state.
 */
export function getUpstreamForClient(clientIp: string): string {
    if (!clientIp) return PROVIDERS[0];

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < clientIp.length; i++) {
        hash = ((hash << 5) - hash) + clientIp.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    
    // Ensure positive
    hash = Math.abs(hash);
    
    const index = hash % PROVIDERS.length;
    return PROVIDERS[index];
}

/**
 * Returns the host (domain) part of the upstream URL.
 */
export function getUpstreamHost(upstreamUrl: string): string {
    return upstreamUrl.replace(/^https?:\/\//, '').split('/')[0];
}
