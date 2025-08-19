// netlify/functions/balances.js
import pkg from "pg";
import { cors, getAuth, headers } from "./_auth.js";
const { Pool } = pkg;

const DB_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
let _pool;
function pool() {
  if (!_pool) _pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  return _pool;
}

export const handler = async (event) => {
  // CORS / preflight
  const pre = cors(event);
  if (pre) return pre;

  try {
    // prefer JWT user; allow ?userId= for admin/dev
    const auth = getAuth(event);
    const qs = event.queryStringParameters || {};
    const userId = Number(qs.userId || (auth.ok ? auth.claims.sub : 0));
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ ok:false, error:"unauthorized" }) };
    }

    const sql = `
      SELECT t.symbol AS asset,
             ROUND(b.amount::numeric, t.decimals) AS balance
      FROM balances b
      JOIN tokens   t ON t.id = b.token_id
      WHERE b.user_id = $1
      ORDER BY t.symbol
    `;
    const { rows } = await pool().query(sql, [userId]);

    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, balances: rows }) };
  } catch (e) {
    console.error("balances error:", e);
    return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error:"server_error" }) };
  }
};
