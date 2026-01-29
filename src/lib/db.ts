import { Pool } from 'pg';

// Use a global variable to prevent multiple pools in development (hot reload)
declare global {
  var pool: Pool | undefined;
}

const pool = global.pool || new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '50'), // Increased default for higher concurrency
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 5000, 
});

if (process.env.NODE_ENV === 'development') {
  global.pool = pool;
}

export default pool;
