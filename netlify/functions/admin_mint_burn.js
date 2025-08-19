import { withTx, corsJson, preflight } from "./_db.js";

export async function handler(event) {
  const pre = preflight(event); if (pre) return pre;
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers: corsJson, body: JSON.stringify({ ok:false, error:"method_not_allowed" }) };

  const { userId, qty } = JSON.parse(event.body || "{}"); // qty>0 mint, <0 burn
  if (!userId || !qty)
    return { statusCode: 400, headers: corsJson, body: JSON.stringify({ ok:false, error:"userId_and_qty_required" }) };

  try {
    await withTx(async (c) => {
      await c.query(
        `INSERT INTO wallet(user_id, asset, balance)
         VALUES($1,'SAM',$2)
         ON CONFLICT (user_id,asset)
         DO UPDATE SET balance = wallet.balance + EXCLUDED.balance`,
        [userId, qty]
      );
      await c.query(
        `INSERT INTO ledger(user_id, asset, qty, reason)
         VALUES($1,'SAM',$2,$3)`,
        [userId, qty, qty > 0 ? 'MINT' : 'BURN']
      );
    });
    return { statusCode: 200, headers: corsJson, body: JSON.stringify({ ok:true }) };
  } catch (e) {
    return { statusCode: 500, headers: corsJson, body: JSON.stringify({ ok:false, error:e.message }) };
  }
}
