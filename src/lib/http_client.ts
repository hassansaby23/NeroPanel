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

// Add Logging Interceptor
httpClient.interceptors.request.use((config) => {
    // Construct full URL with params for visibility
    let fullUrl = config.url;
    if (config.params) {
        const usp = new URLSearchParams(config.params);
        fullUrl += `?${usp.toString()}`;
    }
    console.log(`[HttpClient] Request: ${config.method?.toUpperCase()} ${fullUrl}`);
    return config;
});

httpClient.interceptors.response.use(
    (response) => {
        console.log(`[HttpClient] Response [${response.status}]: ${response.config.url}`);
        return response;
    },
    (error) => {
        if (error.response) {
            console.error(`[HttpClient] Error [${error.response.status}]: ${error.config?.url}`);
        } else {
            console.error(`[HttpClient] Network Error: ${error.message} | URL: ${error.config?.url}`);
        }
        return Promise.reject(error);
    }
);

export default httpClient;
