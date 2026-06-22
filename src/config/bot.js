const { Telegraf, session } = require('telegraf');
const sessionMiddleware = require('../bot/middleware/session');
const startHandler = require('../bot/handlers/start');
const { buyHandler, handleCoinSelection, handleNetworkSelection, handleAmountEntry, handleConfirm } = require('../bot/handlers/buy');
const { pendingOrdersHandler, setrateHandler, statsHandler } = require('../bot/handlers/admin');
const { initializeRates } = require('../services/rateService');

let bot = null;

function createBot() {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    throw new Error('Missing BOT_TOKEN in environment variables');
  }

  bot = new Telegraf(token);

  bot.use(session());
  bot.use(sessionMiddleware);

  bot.start(startHandler);

  bot.hears('🟢 Buy Crypto', buyHandler);
  bot.hears('🔴 Sell Crypto', (ctx) => ctx.reply('Sell feature coming soon!'));
  bot.hears('📈 Rates', async (ctx) => {
    const { getAllRates } = require('../services/rateService');
    const rates = await getAllRates();
    let message = '<b>💱 Current Rates</b>\n\n';
    rates.forEach(rate => {
      message += `${rate.coin}:\n  Buy: ₦${rate.buyRate.toLocaleString()}\n  Sell: ₦${rate.sellRate.toLocaleString()}\n\n`;
    });
    await ctx.reply(message, { parse_mode: 'HTML' });
  });
  bot.hears('📜 My Orders', async (ctx) => {
    const Order = require('../models/Order');
    const orders = await Order.find({ userId: ctx.from.id }).sort({ createdAt: -1 });
    if (orders.length === 0) return ctx.reply('No orders yet.');
    let message = '<b>Your Orders</b>\n\n';
    orders.slice(0, 5).forEach(order => {
      message += `${order.orderRef} - ${order.status}\n  ${order.cryptoAmount} ${order.coin} → ₦${order.nairaAmount}\n\n`;
    });
    await ctx.reply(message, { parse_mode: 'HTML' });
  });

  bot.command('pending', pendingOrdersHandler);
  bot.command('stats', statsHandler);
  bot.command('setrate', setrateHandler);

  bot.on('message', async (ctx) => {
    if (!ctx.session.step) return;

    switch (ctx.session.step) {
      case 'SELECT_COIN':
        return handleCoinSelection(ctx);
      case 'SELECT_NETWORK':
        return handleNetworkSelection(ctx);
      case 'ENTER_AMOUNT':
        return handleAmountEntry(ctx);
      case 'CONFIRM_ORDER':
        return handleConfirm(ctx);
    }
  });

  return bot;
}

async function initializeBot() {
  try {
    const botInstance = createBot();
    await initializeRates();

    if (process.env.WEBHOOK_URL) {
      await botInstance.telegram.setWebhook(process.env.WEBHOOK_URL + '/webhook');
      console.log('✅ Bot webhook set');
    } else {
      botInstance.launch();
      console.log('✅ Bot polling started');
    }

    return botInstance;
  } catch (error) {
    console.error('❌ Bot initialization failed:', error.message);
    throw error;
  }
}

function getBot() {
  return bot;
}

module.exports = {
  createBot,
  initializeBot,
  getBot
};
