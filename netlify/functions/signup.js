// netlify/functions/signup.js
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

// env + pool
const DB_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) throw new Error("No DATABASE_URL/NETLIFY_DATABASE_URL set");

let _pool;
function pool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 5_000,
    });
  }
  return _pool;
}

// CORS / JSON
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": process.env.APP_ORIGIN || "*", // tighten to your site later
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler = async (event) => {
  // preflights & probe
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod === "GET")
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, note: "signup alive — POST {username,email,password}" }),
    };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "method_not_allowed" }) };

  // parse
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "bad_json" }) };
  }

  const username = String(payload.username || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");

  // validate
  if (!username || !email || !password)
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "missing_fields" }) };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "invalid_email" }) };
  if (password.length < 8)
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "weak_password" }) };
  if (username.length > 64 || email.length > 254)
    return { statusCode: 413, headers, body: JSON.stringify({ ok: false, error: "too_long" }) };

  try {
    const db = pool();

    // --- bootstrap (idempotent) -------------------------------------------
    // create table if missing
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT NOT NULL,
        password TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    // ensure a UNIQUE constraint on email (so ON CONFLICT works)
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'users_email_key'
            AND conrelid = 'public.users'::regclass
        ) THEN
          ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);
        END IF;
      END$$;
    `);
    // ----------------------------------------------------------------------

    // hash (bcryptjs)
    const password_hash = bcrypt.hashSync(password, 10);

    const upsert = `
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE
        SET username = EXCLUDED.username,
            password = EXCLUDED.password
      RETURNING id, username, email, created_at
    `;
    const { rows } = await db.query(upsert, [username, email, password_hash]);

    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, user: rows[0] }) };
  } catch (e) {
    console.error("signup error:", e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: "server_error", detail: e.message }),
    };
  }
};
