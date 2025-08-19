import { pool, corsJson } from "./_db.js";

export async function handler() {
  try {
    // find today’s day of week (0=Sunday...6=Saturday)
    const today = new Date().getUTCDay();

    // get today’s percent from the plan
    const plan = await pool.query(
      "SELECT percent FROM price_plan WHERE day_of_week = $1",
      [today]
    );

    if (plan.rows.length === 0) {
      return {
        statusCode: 200,
        headers: corsJson,
        body: JSON.stringify({ ok: true, message: "No plan set for today" })
      };
    }

    const pct = plan.rows[0].percent;

    // update SAM price
    const result = await pool.query(`
      UPDATE price_admin
      SET px = px * (1 + $1)
      WHERE asset = 'SAM' AND quote = 'USDT'
      RETURNING px
    `, [pct]);

    return {
      statusCode: 200,
      headers: corsJson,
      body: JSON.stringify({ ok: true, percent: pct, newPrice: result.rows[0].px })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsJson,
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
}
