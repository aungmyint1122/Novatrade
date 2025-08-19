import { pool, corsJson } from "./_db.js";

export async function handler() {
  try {
    // increase SAM price by 2% daily (example)
    const result = await pool.query(`
      UPDATE price_admin
      SET px = px * 1.02
      WHERE asset = 'SAM' AND quote = 'USDT'
      RETURNING px
    `);

    return {
      statusCode: 200,
      headers: corsJson,
      body: JSON.stringify({ ok: true, newPrice: result.rows[0].px })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsJson,
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
}
