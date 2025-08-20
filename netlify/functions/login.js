const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");   // make sure bcryptjs is in dependencies
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }   // Neon requires SSL
});

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

    // compare hashed password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid password" }) };
    }

    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
      },
      process.env.JWT_SECRET || "dev_secret",
      { expiresIn: "7d" }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, token, user }),
    };
  } catch (err) {
    console.error("Login error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
