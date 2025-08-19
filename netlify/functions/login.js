import pkg from "pg";
import bcrypt from "bcryptjs";
import { cors, headers, signToken } from "./_auth.js";
const { Pool } = pkg;

const DB_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

let _pool;
function pool() {
  if (!_pool) {
    if (!DB_URL) throw new Error("DATABASE_URL missing");
    _pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  }
  return _pool;
}

export const handler = async (event) => {
  const pre = cors(event); if (pre) return pre;
  if (event.httpMethod === "GET")
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, note:"login alive — POST {email,password}" }) };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ ok:false, error:"method_not_allowed" }) };

  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); } catch {}
  const email = (payload.email || "").trim().toLowerCase();
  const password = payload.password || "";
  if (!email || !password)
    return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"missing_fields" }) };

  try {
    const { rows } = await pool().query(
      "SELECT id, username, email, password FROM users WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );
    if (!rows.length)
      return { statusCode: 401, headers, body: JSON.stringify({ ok:false, error:"invalid_credentials" }) };

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password || "");
    if (!ok)
      return { statusCode: 401, headers, body: JSON.stringify({ ok:false, error:"invalid_credentials" }) };

    const token = signToken(u);               // 🔒 same secret as profile
    const user  = { id:u.id, username:u.username, email:u.email };
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, token, user }) };
  } catch (e) {
    console.error("login error:", e);
    return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error:"server_error" }) };
  }
};
