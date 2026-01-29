import { Pool } from 'pg';

// Use a global variable to prevent multiple pools in development (hot reload)
declare global {
  var pool: Pool | undefined;
}

const pool = global.pool || new Pool({
  connectionString: process.env.DATABASE_URL,
});

if (process.env.NODE_ENV === 'development') {
  global.pool = pool;
}

export default pool;
