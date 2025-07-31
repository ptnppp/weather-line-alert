import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await pool.query(`
  CREATE TABLE IF NOT EXISTS line_users (
    user_id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);
