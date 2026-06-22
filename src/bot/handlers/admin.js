const Order = require('../../models/Order');
const User = require('../../models/User');
const { setRate, getRate } = require('../../services/rateService');
const { updateOrderStatus } = require('../../services/orderService');
const { ORDER_STATUS } = require('../../utils/constants');

async function isAdmin(ctx) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
  return adminIds.includes(ctx.from.id);
}

async function pendingOrdersHandler(ctx) {
  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ Unauthorized. Admin only.');
  }

  const orders = await Order.find({
    status: { $in: [ORDER_STATUS.WAITING_PAYMENT, ORDER_STATUS.PAYMENT_UPLOADED] }
  }).populate('userId');

  if (orders.length === 0) {
    return ctx.reply('✅ No pending orders.');
  }

  let message = '<b>📋 Pending Orders</b>\n\n';

  orders.forEach((order, idx) => {
    message += `
${idx + 1}. <b>${order.orderRef}</b>
   User: @${order.userId.username || order.userId.telegramId}
   Coin: ${order.coin} (${order.network})
   Amount: ${order.cryptoAmount} ${order.coin}
   Naira: ₦${order.nairaAmount.toLocaleString()}
   Status: ${order.status}
   `;
  });

  await ctx.reply(message, { parse_mode: 'HTML' });
}

async function setrateHandler(ctx) {
  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ Unauthorized. Admin only.');
  }

  const args = ctx.message.text.split(' ');

  if (args.length < 3) {
    return ctx.reply('Usage: /setrate USDT 1630');
  }

  const coin = args[1].toUpperCase();
  const rate = parseFloat(args[2]);

  if (isNaN(rate) || rate <= 0) {
    return ctx.reply('Invalid rate. Please enter a valid number.');
  }

  const spread = 40;
  const buyRate = rate;
  const sellRate = rate - spread;

  await setRate(coin, buyRate, sellRate);

  const message = `
✅ <b>Rate Updated</b>

Coin: <b>${coin}</b>
Buy Rate: <b>₦${buyRate.toLocaleString()}</b>
Sell Rate: <b>₦${sellRate.toLocaleString()}</b>
  `;

  await ctx.reply(message, { parse_mode: 'HTML' });
}

async function statsHandler(ctx) {
  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ Unauthorized. Admin only.');
  }

  const total = await Order.countDocuments({});
  const completed = await Order.countDocuments({ status: ORDER_STATUS.COMPLETED });
  const pending = await Order.countDocuments({ status: ORDER_STATUS.WAITING_PAYMENT });
  const verified = await Order.countDocuments({ status: ORDER_STATUS.PAYMENT_VERIFIED });

  const message = `
📊 <b>Statistics</b>

Total Orders: ${total}
Completed: ${completed}
Pending Payment: ${pending}
Payment Verified: ${verified}
  `;

  await ctx.reply(message, { parse_mode: 'HTML' });
}

module.exports = {
  isAdmin,
  pendingOrdersHandler,
  setrateHandler,
  statsHandler
};
