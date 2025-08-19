import bcrypt from "bcryptjs";
import { signToken } from "./_auth.js";
import { pool } from "./_db.js";

export default async function handler(req) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (req.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "method_not_allowed" }) };
  }

  try {
    const { email, password } = JSON.parse(req.body || "{}");
    if (!email || !password) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "missing_fields" }) };
    }

    // fetch user from DB including is_admin
    const { rows } = await pool().query(
      "SELECT id, username, email, password, is_admin FROM users WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: "invalid_credentials" }) };
    }

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password || "");
    if (!ok) {
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: "invalid_credentials" }) };
    }

    // include is_admin in token
    const token = signToken(u);
    const user = { id: u.id, username: u.username, email: u.email, is_admin: u.is_admin };

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token, user }) };
  } catch (err) {
    console.error("Login error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "server_error" }) };
  }
}
