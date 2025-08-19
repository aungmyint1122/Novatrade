// Shared DB + CORS helpers
import pg from "pg";
const { Pool } = pg;

const DB_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

export const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

export async function withTx(run) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await run(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export const corsJson = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": process.env.APP_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

export function preflight(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsJson, body: "" };
  }
  return null;
}
