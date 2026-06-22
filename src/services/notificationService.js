const { Markup } = require('telegraf');

async function notifyAdminNewPayment(ctx, order, user) {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) return;

  const message = `
🔔 <b>NEW PAYMENT RECEIVED</b>

<b>Order:</b> ${order.orderRef}
<b>User:</b> @${user.username || user.telegramId}
<b>Coin:</b> ${order.coin} (${order.network})
<b>Amount:</b> ${order.cryptoAmount} ${order.coin}
<b>Naira:</b> ₦${order.nairaAmount.toLocaleString()}
<b>Status:</b> Waiting verification
  `;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Verify', `verify_payment_${order._id}`),
      Markup.button.callback('❌ Reject', `reject_payment_${order._id}`)
    ]
  ]);

  await ctx.telegram.sendMessage(adminGroupId, message, {
    parse_mode: 'HTML',
    ...keyboard
  });
}

async function notifyAdminNewOrder(ctx, order, user) {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) return;

  const message = `
📝 <b>NEW ORDER CREATED</b>

<b>Order:</b> ${order.orderRef}
<b>User:</b> @${user.username || user.telegramId}
<b>Type:</b> ${order.type}
<b>Coin:</b> ${order.coin} (${order.network})
<b>Amount:</b> ${order.cryptoAmount} ${order.coin}
<b>Naira:</b> ₦${order.nairaAmount.toLocaleString()}
  `;

  await ctx.telegram.sendMessage(adminGroupId, message, { parse_mode: 'HTML' });
}

async function notifyUserOrderExpired(ctx, userId, orderRef) {
  const message = `⏰ <b>Order Expired</b>\n\nOrder ${orderRef} has expired. Payment was not received within 30 minutes.`;

  try {
    await ctx.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`Failed to notify user ${userId}:`, error.message);
  }
}

module.exports = {
  notifyAdminNewPayment,
  notifyAdminNewOrder,
  notifyUserOrderExpired
};
