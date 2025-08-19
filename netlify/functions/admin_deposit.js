const { authAdmin } = require("./_auth");
const { query } = require("./_db");

exports.handler = async (event) => {
  try {
    // Check admin auth
    const user = authAdmin(event);
    if (!user) {
      return { statusCode: 403, body: JSON.stringify({ error: "Not authorized" }) };
    }

    const { user_id, asset, amount } = JSON.parse(event.body);

    await query(
      "INSERT INTO balances (user_id, asset, amount) VALUES ($1, $2, $3) ON CONFLICT (user_id, asset) DO UPDATE SET amount = balances.amount + $3",
      [user_id, asset, amount]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, message: "Deposit successful" }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
