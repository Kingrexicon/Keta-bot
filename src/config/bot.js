const { Telegraf, session } = require('telegraf');
const sessionMiddleware = require('../bot/middleware/session');
const startHandler = require('../bot/handlers/start');
const { buyHandler, handleAmountEntry, handleChainSelection, handleWalletEntry, handleConfirm } = require('../bot/handlers/buy');
const { handleClaimPayment, handleConfirmPayment, handleReleaseCrypto } = require('../bot/handlers/payment');
const { notifyAdminNewOrder } = require('../services/notificationService');
const { pendingOrdersHandler, setrateHandler, statsHandler } = require('../bot/handlers/admin');
const { initializeRates } = require('../services/rateService');
const Order = require('../models/Order');

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

  // Main menu handlers
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
    const orders = await Order.find({ clientTelegramId: ctx.from.id }).sort({ createdAt: -1 });
    if (orders.length === 0) return ctx.reply('No orders yet.');

    let message = '<b>Your Orders</b>\n\n';
    orders.slice(0, 5).forEach(order => {
      message += `${order.orderRef} - ${order.status}\n  ₦${order.fiatAmount.toLocaleString()} → ${order.cryptoAmount} ${order.chain}\n\n`;
    });
    await ctx.reply(message, { parse_mode: 'HTML' });
  });

  // Admin commands
  bot.command('pending', pendingOrdersHandler);
  bot.command('stats', statsHandler);
  bot.command('setrate', setrateHandler);

  // Client callback: "I've paid"
  bot.action(/claim_payment_/, handleClaimPayment);

  // Admin callback: confirm payment received
  bot.action(/confirm_payment_/, handleConfirmPayment);

  // Admin callback: release crypto
  bot.action(/release_crypto_/, handleReleaseCrypto);

  // Handle photo messages (receipt screenshots) — no longer used in new flow but keep for safety
  bot.on('photo', async (ctx) => {
    await ctx.reply('Please use the order flow to submit your payment claim instead of sending a photo.');
  });

  // Handle text messages for the buy flow state machine
  bot.on('message', async (ctx) => {
    if (!ctx.message.text) return;

    const { session: s } = ctx;

    if (!s.step) return;

    // Don't re-process messages already handled by bot.hears() menu handlers
    const menuButtons = ['🟢 Buy Crypto', '🔴 Sell Crypto', '📈 Rates', '📜 My Orders'];
    if (menuButtons.includes(ctx.message.text)) return;

    switch (s.step) {
      case 'ENTER_AMOUNT':
        return handleAmountEntry(ctx);
      case 'SELECT_CHAIN':
        return handleChainSelection(ctx);
      case 'ENTER_WALLET':
        return handleWalletEntry(ctx);
      case 'CONFIRM_ORDER':
        return handleConfirm(ctx);
    }
  });

  // Global error handler
  bot.catch((err) => {
    console.error('Bot error:', err.message, err.stack);
  });

  return bot;
}

async function initializeBot() {
  try {
    const botInstance = createBot();
    await initializeRates();

    const isProduction = process.env.NODE_ENV === 'production';
    const usePolling = process.env.USE_POLLING === 'true' || !isProduction || !process.env.WEBHOOK_URL;

    if (!usePolling && process.env.WEBHOOK_URL) {
      await botInstance.telegram.setWebhook(process.env.WEBHOOK_URL + '/webhook');
      console.log('✅ Bot webhook set');
    } else {
      await botInstance.launch();
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