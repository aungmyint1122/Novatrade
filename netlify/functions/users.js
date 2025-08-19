import { getPool } from './_db.js';
import { jsonResponse, handleOptions } from './_cors.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return jsonResponse({ ok: false, error: 'method' }, 405);

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, username, email, created_at FROM users ORDER BY id DESC'
    );
    return jsonResponse({ ok: true, rows });
  } catch (err) {
    console.error('users error', err);
    return jsonResponse({ ok: false, error: 'server' }, 500);
  }
}
