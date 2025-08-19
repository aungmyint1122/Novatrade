import { pool, corsJson, preflight } from "./_db.js";

export async function handler(event) {
  const pre = preflight(event); if (pre) return pre;
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers: corsJson, body: JSON.stringify({ ok:false, error:"method_not_allowed" }) };

  const { asset = "SAM", quote = "USDT", px } = JSON.parse(event.body || "{}");
  if (!px) return { statusCode: 400, headers: corsJson, body: JSON.stringify({ ok:false, error:"px_required" }) };

  try {
    await pool.query(
      `INSERT INTO price_admin(asset, quote, px)
       VALUES($1,$2,$3)
       ON CONFLICT (asset,quote) DO UPDATE SET px=$3, updated_at=now()`,
      [asset, quote, px]
    );
    // audit entry (optional)
    await pool.query(
      `INSERT INTO ledger(user_id, asset, qty, reason, ref)
       VALUES(NULL, $1, 0, 'SET_PRICE', $2)`,
      [asset, `px=${px}`]
    );
    return { statusCode: 200, headers: corsJson, body: JSON.stringify({ ok:true }) };
  } catch (e) {
    return { statusCode: 500, headers: corsJson, body: JSON.stringify({ ok:false, error:e.message }) };
  }
}
