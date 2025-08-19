import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function handler() {
  try {
    const r = await pool.query("select 1 as ok");
    return { statusCode: 200, body: JSON.stringify({ env: !!process.env.DATABASE_URL, db: r.rows[0].ok }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
