// netlify/functions/login.js
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { email, password } = JSON.parse(event.body);
    const client = await pool.connect();

    const result = await client.query(
      "SELECT id, username, email, password, is_admin FROM users WHERE email = $1",
      [email]
    );
    client.release();

    if (result.rowCount === 0) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid email" }) };
    }

    const user = result.rows[0];

    if (user.password !== password) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid password" }) };
    }

    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, token, user }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
