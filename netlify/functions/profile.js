// netlify/functions/profile.js
import pkg from "pg";
import { cors, getAuth, headers } from "./_auth.js";
const { Pool } = pkg;

const DB_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

let _pool;
function pool() {
  if (!_pool) {
    if (!DB_URL) throw new Error("DATABASE_URL not set");
    _pool = new Pool({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return _pool;
}

export const handler = async (event) => {
  // CORS / preflight
  const pre = cors(event);
  if (pre) return pre;

  // Health probe (no token)
  if (event.httpMethod === "GET" && !event.headers.authorization) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, note: "profile alive — send Bearer token" }),
    };
  }

  // Require a valid JWT
  const auth = getAuth(event);
  if (!auth.ok) {
    return { statusCode: auth.statusCode, headers, body: JSON.stringify(auth.body) };
  }

  // Accept both shapes: { sub: id } or { id }
  const claims = auth.claims || {};
  const userId = claims.sub || claims.id;
  if (!userId) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: "invalid_token_no_id" }) };
  }

  try {
    const { rows } = await pool().query(
      "SELECT id, username, email, created_at FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );
    if (!rows.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: "user_not_found" }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, user: rows[0] }) };
  } catch (err) {
    console.error("profile error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "server_error" }) };
  }
};
