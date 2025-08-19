import { verifyToken } from "./_auth.js";
import { pool } from "./_db.js";

export default async function handler(req) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (req.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "method_not_allowed" }) };
  }

  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: "missing_token" }) };
    }

    const token = auth.replace("Bearer ", "").trim();
    const decoded = verifyToken(token);

    // check is_admin flag
    if (!decoded.is_admin) {
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: "forbidden_not_admin" }) };
    }

    const { user_id, asset, amount } = JSON.parse(req.body || "{}");
    if (!user_id || !asset || !amount) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "missing_fields" }) };
    }

    // insert/update balance
    await pool().query(
      `INSERT INTO balances (user_id, asset, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, asset)
       DO UPDATE SET amount = balances.amount + $3`,
      [user_id, asset, amount]
    );

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: "deposit_success" }) };
  } catch (err) {
    console.error("Admin deposit error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "server_error" }) };
  }
}
