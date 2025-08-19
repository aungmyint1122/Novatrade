import { pool, corsJson, preflight } from "./_db.js";

export async function handler(event) {
  const pre = preflight(event); if (pre) return pre;
  try {
    const { rows } = await pool.query("SELECT asset, quote, px FROM price_admin");
    const out = {};
    rows.forEach(r => out[`${r.asset}/${r.quote}`] = r.px);
    return { statusCode: 200, headers: corsJson, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 500, headers: corsJson, body: JSON.stringify({ ok:false, error:e.message }) };
  }
}
