import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import http from 'http';
import https from 'https';

// 1. Configure Connection Pooling
// Keep-Alive reduces the overhead of establishing a new TCP connection for every request.
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 10, timeout: 60000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 10, timeout: 60000 });

// 2. Create Axios Instance
const httpClient: AxiosInstance = axios.create({
    timeout: 60000, // 60 seconds default
    httpAgent,
    httpsAgent,
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en,nl;q=0.9,pl;q=0.8,de;q=0.7,es;q=0.6,fr;q=0.5,ar;q=0.4,en-US;q=0.3',
        'Priority': 'u=0, i',
        'Sec-Ch-Ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
    },
    // Prevent axios from throwing on 4xx/5xx so we can handle retries manually if needed
    // or let the interceptor handle it.
    validateStatus: (status) => status >= 200 && status < 300
});

// 3. Add Retry Logic (Exponential Backoff)
httpClient.interceptors.response.use(undefined, async (err) => {
    const config = err.config as AxiosRequestConfig & { _retryCount?: number };
    
    // If no config, just reject
    if (!config) return Promise.reject(err);

    // Initialize retry count
    config._retryCount = config._retryCount || 0;

    // Retry conditions:
    // - Network Error (no response)
    // - 5xx Server Errors
    // - 429 Too Many Requests
    // - 403 Forbidden (Sometimes WAFs block temporarily under load)
    const shouldRetry = 
        !err.response || 
        (err.response.status >= 500 && err.response.status <= 599) ||
        err.response.status === 429 ||
        err.response.status === 403;

    // Limit retries to 3
    if (shouldRetry && config._retryCount < 3) {
        config._retryCount += 1;
        
        // Exponential backoff: 1000ms, 2000ms, 4000ms
        const delay = 1000 * Math.pow(2, config._retryCount - 1);
        
        console.warn(`[HttpClient] Retrying request to ${config.url} (Attempt ${config._retryCount}/3) after ${delay}ms. Error: ${err.message} ${err.response?.status ? `[${err.response.status}]` : ''}`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return httpClient(config);
    }

    return Promise.reject(err);
});

export default httpClient;
