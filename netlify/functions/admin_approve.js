import { withTx, pool, corsJson, preflight } from "./_db.js";

export async function handler(event) {
  const pre = preflight(event); if (pre) return pre;
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers: corsJson, body: JSON.stringify({ ok:false, error:"method_not_allowed" }) };

  const { reqId, approve = true } = JSON.parse(event.body || "{}");
  if (!reqId)
    return { statusCode: 400, headers: corsJson, body: JSON.stringify({ ok:false, error:"reqId_required" }) };

  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, asset, amount, status
       FROM deposit_request
       WHERE id=$1 FOR UPDATE`,
      [reqId]
    );
    if (!rows.length)
      return { statusCode: 404, headers: corsJson, body: JSON.stringify({ ok:false, error:"not_found" }) };

    const r = rows[0];
    if (r.status !== 'PENDING')
      return { statusCode: 409, headers: corsJson, body: JSON.stringify({ ok:false, error:"already_handled" }) };

    if (!approve) {
      await pool.query(`UPDATE deposit_request SET status='DENIED', reviewed_at=now() WHERE id=$1`, [reqId]);
      return { statusCode: 200, headers: corsJson, body: JSON.stringify({ ok:true, status:'DENIED' }) };
    }

    await withTx(async (c) => {
      await c.query(`UPDATE deposit_request SET status='APPROVED', reviewed_at=now() WHERE id=$1`, [reqId]);
      await c.query(
        `INSERT INTO wallet(user_id, asset, balance)
         VALUES($1,$2,$3)
         ON CONFLICT (user_id,asset)
         DO UPDATE SET balance = wallet.balance + EXCLUDED.balance`,
        [r.user_id, r.asset, r.amount]
      );
      await c.query(
        `INSERT INTO ledger(user_id, asset, qty, reason, ref)
         VALUES($1,$2,$3,'DEPOSIT_APPROVED',$4)`,
        [r.user_id, r.asset, r.amount, `req:${reqId}`]
      );
    });

    return { statusCode: 200, headers: corsJson, body: JSON.stringify({ ok:true, status:'APPROVED' }) };
  } catch (e) {
    return { statusCode: 500, headers: corsJson, body: JSON.stringify({ ok:false, error:e.message }) };
  }
}
