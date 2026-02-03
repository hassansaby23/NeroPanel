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
    // Mimic curl behavior:
    // 1. No compression
    // 2. Curl User-Agent
    // 3. Raw response (no auto JSON parsing if possible, though axios defaults to JSON)
    decompress: false, 
    headers: {
        'Accept': '*/*',
        'User-Agent': 'curl/7.68.0', // Mimic standard curl
        'Accept-Encoding': 'identity', // Explicitly disable compression
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
