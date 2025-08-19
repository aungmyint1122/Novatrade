const { query } = require('./_db');
const { authAdmin } = require('./_auth');

exports.handler = async (event, context) => {
  try {
    const admin = authAdmin(event); // check admin token
    if (!admin) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const { user_id, asset, amount } = JSON.parse(event.body);

    if (!user_id || !asset || !amount) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing fields" }) };
    }

    // Insert or update balances
    await query(
      `INSERT INTO balances (user_id, asset, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, asset)
       DO UPDATE SET amount = balances.amount + EXCLUDED.amount`,
      [user_id, asset, amount]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, msg: "Deposit successful" })
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
