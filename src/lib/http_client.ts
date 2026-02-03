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
        // Use standard Android http client User-Agent which is less likely to be blocked than "IPTVSmartersPro"
        'User-Agent': 'okhttp/4.12.0', 
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate' // Important for WAFs to see us as a real client
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
