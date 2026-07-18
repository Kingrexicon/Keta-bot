const { Telegraf, session } = require('telegraf');
const sessionMiddleware = require('../bot/middleware/session');
const startHandler = require('../bot/handlers/start');
const { buyHandler, handleAmountEntry, handleChainSelection, handleWalletEntry, handleConfirm } = require('../bot/handlers/buy');
const { handleClaimPayment, handleRejectPayment, handleCancelClaim, handleConfirmPayment, handleReleaseCrypto, handleResurrectOrder, handleReceiptSubmission } = require('../bot/handlers/payment');
const { notifyAdminNewOrder } = require('../services/notificationService');
const { pendingOrdersHandler, setrateHandler, statsHandler, balanceHandler } = require('../bot/handlers/admin');
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
    const { COINS } = require('../utils/constants');
    const rates = await getAllRates();
    let message = '<b>💱 Current Rates</b>\n\n';
    rates.forEach(rate => {
      // Only show supported coins
      if (Object.values(COINS).includes(rate.coin)) {
        message += `${rate.coin}:\n`;
        message += `  Buy:  ₦${rate.buyRate.toLocaleString()}\n`;
        message += `  Sell: ₦${rate.sellRate.toLocaleString()}\n`;
        if (rate.usdPrice) {
          message += `  USD:  $${rate.usdPrice.toFixed(2)}\n`;
        }
        message += '\n';
      }
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

  // Admin commands (both /command and text button work)
  bot.command('pending', pendingOrdersHandler);
  bot.hears('pending', pendingOrdersHandler);
  bot.command('stats', statsHandler);
  bot.hears('stats', statsHandler);
  bot.command('setrate', setrateHandler);
  bot.hears('setrate USDT 1630', setrateHandler);
  bot.command('balances', balanceHandler);
  bot.hears('balances', balanceHandler);
  bot.hears('help', (ctx) => ctx.reply('Admin commands:\n/pending - View pending orders\n/stats - Order statistics\n/setrate - Update rates\n/balances - Check wallet balances'));

  // Client callback: "I've paid"
  bot.action(/claim_payment_/, handleClaimPayment);

  // Admin callback: reject payment claim
  bot.action(/reject_payment_/, handleRejectPayment);

  // Client callback: cancel their own claim
  bot.action(/cancel_claim_/, handleCancelClaim);

  // Admin callback: confirm payment received
  bot.action(/confirm_payment_/, handleConfirmPayment);

  // Admin callback: release crypto
  bot.action(/release_crypto_/, handleReleaseCrypto);

  // Admin callback: resurrect expired order
  bot.action(/resurrect_order_/, handleResurrectOrder);

  // Handle photo messages (receipt screenshots)
  bot.on('photo', async (ctx) => {
    // Check if user is awaiting receipt submission for a payment claim
    if (ctx.session?.awaitingReceiptOrderRef) {
      return handleReceiptSubmission(ctx);
    }
    
    // Otherwise, guide user to proper flow
    await ctx.reply('📸 To submit a payment receipt, first tap "I\'ve paid" on an order, then send the receipt photo.');
  });

  // Handle text messages for the buy flow state machine
  bot.on('message', async (ctx) => {
    if (!ctx.message.text) return;

    const { session: s } = ctx;

    if (!s.step) return;

    // Don't re-process messages already handled by bot.hears() menu handlers
    const menuButtons = ['🟢 Buy Crypto', '🔴 Sell Crypto', '📈 Rates', '📜 My Orders', 'pending', 'stats', 'balances', 'setrate USDT 1630', 'help'];
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

// Helper: run an async function with a timeout
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

async function initializeBot() {
  try {
    const botInstance = createBot();

    // Initialize rates with a timeout so it doesn't block bot startup
    try {
      await withTimeout(initializeRates(), 15000, 'initializeRates');
    } catch (rateError) {
      console.warn('⚠️ Rate initialization timed out or failed, continuing with bot startup:', rateError.message);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const useWebhook = isProduction && process.env.WEBHOOK_URL && process.env.USE_POLLING !== 'true';

    if (useWebhook) {
      // Remove existing webhook first to avoid conflicts
      await withTimeout(botInstance.telegram.deleteWebhook({ drop_pending_updates: true }), 10000, 'deleteWebhook');
      console.log('✅ Old webhook deleted');
      
      // Set new webhook
      await withTimeout(botInstance.telegram.setWebhook(process.env.WEBHOOK_URL + '/webhook'), 10000, 'setWebhook');
      console.log('✅ Bot webhook set to: ' + process.env.WEBHOOK_URL + '/webhook');
    } else {
      // Always delete webhook before starting polling to ensure clean state
      try {
        await withTimeout(botInstance.telegram.deleteWebhook({ drop_pending_updates: true }), 10000, 'deleteWebhook');
      } catch (e) {
        console.log('⏭️ Webhook delete skipped/timed out, proceeding with polling');
      }
      
      await botInstance.launch();
      console.log('✅ Bot polling started');
    }

    // Test the connection by getting bot info
    try {
      const botInfo = await botInstance.telegram.getMe();
      console.log(`✅ Bot connected: @${botInfo.username}`);
    } catch (error) {
      console.error('⚠️ Bot token may be invalid - Telegram returned error:', error.message);
    }

    return botInstance;
  } catch (error) {
    console.error('❌ Bot initialization failed:', error.message);
    // Don't exit process, let the server still run with debug endpoints
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