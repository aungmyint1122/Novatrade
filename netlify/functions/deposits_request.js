import { pool, corsJson, preflight } from "./_db.js";

export async function handler(event) {
  const pre = preflight(event); if (pre) return pre;
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers: corsJson, body: JSON.stringify({ ok:false, error:"method_not_allowed" }) };

  const { userId, asset, amount, note } = JSON.parse(event.body || "{}");
  if (!userId || !asset || !amount)
    return { statusCode: 400, headers: corsJson, body: JSON.stringify({ ok:false, error:"missing_fields" }) };

  try {
    const { rows } = await pool.query(
      `INSERT INTO deposit_request(user_id, asset, amount, note)
       VALUES($1,$2,$3,$4)
       RETURNING id`,
      [userId, asset, amount, note || null]
    );
    return { statusCode: 200, headers: corsJson, body: JSON.stringify({ ok:true, id: rows[0].id }) };
  } catch (e) {
    return { statusCode: 500, headers: corsJson, body: JSON.stringify({ ok:false, error:e.message }) };
  }
}
