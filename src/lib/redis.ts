import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Use a global variable to preserve the client during hot reloads in development
declare global {
  var redis: Redis | undefined;
}

const redis = global.redis || new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 50, 2000);
    },
});

if (process.env.NODE_ENV === 'development') {
  global.redis = redis;
}

export default redis;
