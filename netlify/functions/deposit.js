// deposit.js
app.post('/api/deposit', async (req, res) => {
  const { userId, tokenId, amount } = req.body;

  await db.query(`
    INSERT INTO balances (user_id, token_id, amount)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, token_id)
    DO UPDATE SET amount = balances.amount + $3
  `, [userId, tokenId, amount]);

  res.json({ success: true, message: "Deposit successful" });
});
