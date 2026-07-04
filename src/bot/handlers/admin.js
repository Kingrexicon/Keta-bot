const Order = require('../../models/Order');
const Admin = require('../../models/Admin');
const { setRate, getRate } = require('../../services/rateService');
const { ORDER_STATUS } = require('../../utils/constants');
const { isAdminUser } = require('./payment');

async function pendingOrdersHandler(ctx) {
  if (!(await isAdminUser(ctx.from.id))) {
    return ctx.reply('❌ Unauthorized. Admin only.');
  }

  const orders = await Order.find({
    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.PAYMENT_CLAIMED] }
  }).sort({ createdAt: -1 });

  if (orders.length === 0) {
    return ctx.reply('✅ No pending orders.');
  }

  let message = '<b>📋 Pending Orders</b>\n\n';

  orders.forEach((order, idx) => {
    message += `
${idx + 1}. <b>${order.orderRef}</b>
   User: @${order.clientUsername || order.clientTelegramId}
   Chain: ${order.chain}
   Amount: ₦${order.fiatAmount.toLocaleString()}
   Crypto: ${order.cryptoAmount} ${order.chain.split('-')[0]}
   Status: ${order.status}
   `;
  });

  await ctx.reply(message, { parse_mode: 'HTML' });
}

async function setrateHandler(ctx) {
  if (!(await isAdminUser(ctx.from.id))) {
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
  if (!(await isAdminUser(ctx.from.id))) {
    return ctx.reply('❌ Unauthorized. Admin only.');
  }

  const total = await Order.countDocuments({});
  const completed = await Order.countDocuments({ status: ORDER_STATUS.RELEASED });
  const pending = await Order.countDocuments({ status: ORDER_STATUS.PENDING });
  const claimed = await Order.countDocuments({ status: ORDER_STATUS.PAYMENT_CLAIMED });
  const verified = await Order.countDocuments({ status: ORDER_STATUS.VERIFIED });

  const message = `
📊 <b>Statistics</b>

Total Orders: ${total}
Released: ${completed}
Pending Payment: ${pending}
Payment Claimed: ${claimed}
Payment Verified: ${verified}
  `;

  await ctx.reply(message, { parse_mode: 'HTML' });
}

module.exports = {
  pendingOrdersHandler,
  setrateHandler,
  statsHandler
};