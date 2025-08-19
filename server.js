// server.js
import 'dotenv/config';
import express from 'express';
import pkg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Add it to .env (DATABASE_URL=postgresql://...)');
  process.exit(1);
}

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon uses SSL; your URL query enforces it, but this is a safe extra:
  ssl: { rejectUnauthorized: false },
});

// Sanity check DB on boot
(async () => {
  try {
    await pool.query('select 1');
    console.log('DB connection OK');
  } catch (e) {
    console.error('DB connection failed:', e.message);
    process.exit(1);
  }
})();

const app = express();

// Parse JSON bodies so we can read { "username": "...", "email": "..." }
app.use(express.json());

/* -------------------------------------------------
 * Health & diagnostics
 * -------------------------------------------------*/
app.get('/time', (req, res) => {
  res.json({ now: new Date().toISOString() });
});

app.get('/diag', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT current_user, current_database(), now()');
    res.json({
      ok: true,
      node: process.versions.node,
      dbUrl: process.env.DATABASE_URL?.replace(/:.+@/, ':***@'), // hide password
      db: rows[0],
    });
  } catch (err) {
    console.error('DB error on /diag:', err);
    res.status(500).json({ ok: false, error: 'db' });
  }
});

app.get('/whoami', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT current_user, current_database(), now()');
    res.json({ ok: true, rows: rows[0] });
  } catch (err) {
    console.error('DB error on /whoami:', err);
    res.status(500).json({ ok: false, error: 'db' });
  }
});

/* -------------------------------------------------
 * Users (read)
 * -------------------------------------------------*/
app.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, created_at FROM users ORDER BY id'
    );
    res.json({ ok: true, rows });
  } catch (err) {
    console.error('DB error on /users:', err);
    res.status(500).json({ ok: false, error: 'db' });
  }
});

/* -------------------------------------------------
 * Users (create) — signup
 * Body: { "username": "alice", "email": "alice@example.com" }
 * -------------------------------------------------*/
app.post('/signup', async (req, res) => {
  try {
    let { username, email } = req.body || {};
    username = (username || '').trim();
    email = (email || '').trim().toLowerCase();

    if (!username || !email) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    // Very light email check (optional)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'bad_email' });
    }

    const q = `
      INSERT INTO users (username, email)
      VALUES ($1, $2)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, username, email, created_at
    `;
    const { rows } = await pool.query(q, [username, email]);

    if (rows.length === 0) {
      // This means email already existed (unique constraint)
      return res.status(409).json({ ok: false, error: 'email_exists' });
    }

    // Log it so you immediately "know"
    console.log('New user created:', rows[0]);

    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error('DB error on /signup:', err);
    res.status(500).json({ ok: false, error: 'db' });
  }
});

/* -------------------------------------------------
 * 404 + Error handlers
 * -------------------------------------------------*/
app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, error: 'server' });
});

/* -------------------------------------------------
 * Boot
 * -------------------------------------------------*/
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);

const shutdown = async () => {
  console.log('\nShutting down…');
  try { await pool.end(); } catch {}
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
