const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const authHeader = event.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.is_admin) {
      return { statusCode: 403, body: JSON.stringify({ error: "not_admin" }) };
    }

    const { token_id, new_price } = JSON.parse(event.body);

    await pool.query(
      `UPDATE prices
       SET price_usd = $1,
           updated_at = now()
       WHERE token_id = $2`,
      [new_price, token_id]
    );

    return { statusCode: 200, body: JSON.stringify({ ok: true, token_id, new_price }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
