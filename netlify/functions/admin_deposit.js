// netlify/functions/admin_deposit.js
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

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return { statusCode: 401, body: JSON.stringify({ error: "invalid_token" }) };
    }

    if (!decoded.is_admin) {
      return { statusCode: 403, body: JSON.stringify({ error: "not_admin" }) };
    }

    const { user_id, asset, amount } = JSON.parse(event.body);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 🔎 Find token_id from tokens table using symbol
      const tokenRes = await client.query(
        "SELECT id FROM tokens WHERE symbol = $1",
        [asset]
      );

      if (tokenRes.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Unknown asset symbol" }),
        };
      }

      const tokenId = tokenRes.rows[0].id;

      // Insert or update balances
      await client.query(
        `INSERT INTO balances (user_id, token_id, amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, token_id)
         DO UPDATE SET amount = balances.amount + EXCLUDED.amount`,
        [user_id, tokenId, amount]
      );

      await client.query("COMMIT");
      client.release();

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, user_id, token_id: tokenId, amount }),
      };
    } catch (err) {
      await client.query("ROLLBACK");
      client.release();
      throw err;
    }
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
