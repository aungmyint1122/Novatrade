const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

exports.handler = async () => {
  try {
    await pool.query(`
      UPDATE prices
      SET price_usd = price_usd * 1.02,
          updated_at = now()
      WHERE token_id = 4
    `);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
