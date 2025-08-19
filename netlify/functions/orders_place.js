// netlify/functions/orders_place.js
import pkg from "pg";
import { cors, getAuth, headers } from "./_auth.js";   // you already have these in your project
const { Pool } = pkg;

const DB_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

let _pool;
function pool() {
  if (!_pool) _pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  return _pool;
}

export const handler = async (event) => {
  // CORS & preflight
  const pre = cors(event);
  if (pre) return pre;

  // Simple GET message (debug)
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, note: "POST { side:'buy'|'sell', asset:'SAM', qty:Number, quote?:'USDT' }" })
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "method_not_allowed" }) };
  }

  // Auth
  const auth = getAuth(event);
  if (!auth.ok) {
    return { statusCode: auth.statusCode, headers, body: JSON.stringify(auth.body) };
  }
  const userId = auth.claims.sub;

  // Parse & validate
  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"bad_json" }) }; }

  const side  = String(payload.side || "").toLowerCase();      // 'buy' | 'sell'
  const asset = String(payload.asset || "").toUpperCase();      // 'SAM'
  const quote = String(payload.quote || "USDT").toUpperCase();  // default 'USDT'
  const qty   = Number(payload.qty);

  if (!["buy","sell"].includes(side) || !asset || !isFinite(qty) || qty <= 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"bad_input" }) };
  }

  const db = await pool().connect();
  try {
    await db.query("BEGIN");

    // Price
    const { rows: pr } = await db.query(
      "select px from price_admin where asset=$1 and quote=$2 limit 1",
      [asset, quote]
    );
    if (!pr.length) {
      await db.query("ROLLBACK");
      return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"no_price" }) };
    }
    const px = Number(pr[0].px);                        // price of 1 asset in quote

    // Resolve token ids
    const { rows: toks } = await db.query(
      "select id, symbol from tokens where symbol = any($1::text[])",
      [[asset, quote]]
    );
    const assetId = toks.find(t => t.symbol === asset)?.id;
    const quoteId = toks.find(t => t.symbol === quote)?.id;
    if (!assetId || !quoteId) {
      await db.query("ROLLBACK");
      return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"unknown_token" }) };
    }

    // Lock balances for both tokens
    const { rows: bals } = await db.query(
      `select token_id, amount from balances
       where user_id = $1 and token_id in ($2,$3)
       for update`,
      [userId, assetId, quoteId]
    );

    // helper: current balance or 0
    const bal = (tid) => Number(bals.find(b => b.token_id === tid)?.amount || 0);

    // ensure rows exist (so updates don't fail)
    if (!bals.find(b => b.token_id === assetId)) {
      await db.query("insert into balances(user_id, token_id, amount) values($1,$2,0) on conflict do nothing", [userId, assetId]);
    }
    if (!bals.find(b => b.token_id === quoteId)) {
      await db.query("insert into balances(user_id, token_id, amount) values($1,$2,0) on conflict do nothing", [userId, quoteId]);
    }

    const cost = qty * px;

    if (side === "buy") {
      // need quote funds ≥ cost
      if (bal(quoteId) + 1e-12 < cost) {               // tiny epsilon
        await db.query("ROLLBACK");
        return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"insufficient_quote" }) };
      }
      await db.query("update balances set amount = amount - $1 where user_id=$2 and token_id=$3", [cost, userId, quoteId]);
      await db.query("update balances set amount = amount + $1 where user_id=$2 and token_id=$3", [qty,  userId, assetId]);
    } else {
      // sell: need asset qty
      if (bal(assetId) + 1e-12 < qty) {
        await db.query("ROLLBACK");
        return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"insufficient_asset" }) };
      }
      await db.query("update balances set amount = amount - $1 where user_id=$2 and token_id=$3", [qty,  userId, assetId]);
      await db.query("update balances set amount = amount + $1 where user_id=$2 and token_id=$3", [cost, userId, quoteId]);
    }

    await db.query("COMMIT");

    // Return fresh balances for these two tokens
    const { rows: out } = await db.query(
      `select t.symbol as asset, b.amount
         from balances b join tokens t on t.id=b.token_id
        where b.user_id=$1 and b.token_id in ($2,$3)
        order by t.symbol`,
      [userId, assetId, quoteId]
    );
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, px, side, qty, asset, quote, balances: out }) };
  } catch (e) {
    console.error("orders_place error:", e);
    try { await db.query("ROLLBACK"); } catch {}
    return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error:"server_error" }) };
  } finally {
    db.release();
  }
};
