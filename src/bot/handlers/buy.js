const { Markup } = require('telegraf');
const { getRate } = require('../../services/rateService');
const { createOrder } = require('../../services/orderService');
const { notifyAdminNewOrder } = require('../../services/notificationService');
const { CHAINS } = require('../../utils/constants');
const { validateWalletAddress } = require('../../utils/validators');
const { chainMenu, cancelMenu, confirmMenu, mainMenu } = require('../keyboards/mainMenu');

async function buyHandler(ctx) {
  ctx.session.orderFlow = { type: 'BUY' };
  ctx.session.step = 'ENTER_AMOUNT';
  await ctx.reply(
    'How much Naira (NGN) do you want to spend?\n\nEnter amount as a number (e.g. 50000):',
    { parse_mode: 'HTML', ...cancelMenu() }
  );
}

async function handleAmountEntry(ctx) {
  const amount = ctx.message.text.trim();

  // Check for cancel first
  if (amount === 'Cancel') {
    ctx.session.orderFlow = null;
    ctx.session.step = null;
    return ctx.reply('Order cancelled.', { ...mainMenu() });
  }

  const parsedAmount = parseFloat(amount);

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return ctx.reply('Invalid amount. Please enter a valid number.', { ...cancelMenu() });
  }

  ctx.session.orderFlow.fiatAmount = parsedAmount;
  ctx.session.step = 'SELECT_CHAIN';

  await ctx.reply(
    `Amount: <b>₦${parsedAmount.toLocaleString()}</b>\n\nSelect the chain for receiving crypto:`,
    { parse_mode: 'HTML', ...chainMenu() }
  );
}

async function handleChainSelection(ctx) {
  const chain = ctx.message.text.trim();

  if (chain === 'Cancel') {
    ctx.session.orderFlow = null;
    ctx.session.step = null;
    return ctx.reply('Order cancelled.', { ...mainMenu() });
  }

  if (!Object.values(CHAINS).includes(chain)) {
    return ctx.reply('Invalid chain. Please select from the menu.', { ...chainMenu() });
  }

  ctx.session.orderFlow.chain = chain;
  ctx.session.step = 'ENTER_WALLET';

  await ctx.reply(
    `Selected: <b>${chain}</b>\n\nEnter your <b>${chain}</b> wallet address where you want to receive the crypto:`,
    { parse_mode: 'HTML', ...cancelMenu() }
  );
}

async function handleWalletEntry(ctx) {
  const walletAddress = ctx.message.text.trim();

  if (walletAddress === 'Cancel') {
    ctx.session.orderFlow = null;
    ctx.session.step = null;
    return ctx.reply('Order cancelled.', { ...mainMenu() });
  }

  const chain = ctx.session.orderFlow.chain;

  if (!validateWalletAddress(walletAddress, chain)) {
    return ctx.reply(
      `❌ Invalid wallet address for <b>${chain}</b>.\n\nPlease check the address and try again.`,
      { parse_mode: 'HTML', ...cancelMenu() }
    );
  }

  ctx.session.orderFlow.walletAddress = walletAddress;
  ctx.session.step = 'CONFIRM_ORDER';

  // Get rate for the coin portion of the chain
  const coin = chain.split('-')[0]; // e.g. "USDT-TRC20" -> "USDT"
  const rate = await getRate(coin);

  if (!rate) {
    return ctx.reply('Rate not available. Try again later.');
  }

  const fiatAmount = ctx.session.orderFlow.fiatAmount;
  const cryptoAmount = Math.floor((fiatAmount / rate.buyRate) * 10000) / 10000;

  ctx.session.orderFlow.rate = rate.buyRate;
  ctx.session.orderFlow.cryptoAmount = cryptoAmount;

  const summary = `
<b>Order Summary</b>

Amount to send: <b>₦${fiatAmount.toLocaleString()}</b>
Chain: <b>${chain}</b>
You will receive: <b>${cryptoAmount} ${coin}</b>
Rate: <b>₦${rate.buyRate.toLocaleString()}</b>
Wallet: <code>${walletAddress}</code>

Confirm this order?
  `;

  await ctx.reply(summary, {
    parse_mode: 'HTML',
    ...confirmMenu()
  });
}

async function handleConfirm(ctx) {
  if (ctx.message.text === '❌ Cancel') {
    ctx.session.orderFlow = null;
    ctx.session.step = null;
    return ctx.reply('Order cancelled.', { ...mainMenu() });
  }

  if (ctx.message.text !== '✅ Confirm') {
    return ctx.reply('Invalid action. Please select Confirm or Cancel.', { ...confirmMenu() });
  }

  const flow = ctx.session.orderFlow;

  const order = await createOrder(
    ctx.from.id,
    ctx.from.username || '',
    flow.chain,
    flow.fiatAmount,
    flow.rate
  );

  // Save wallet address on the order
  order.walletAddress = flow.walletAddress;
  await order.save();

  await notifyAdminNewOrder(ctx, order, ctx.from);

  const bankDetails = `
✅ <b>Order Created Successfully!</b>

<b>Order Reference:</b> <code>${order.orderRef}</code>

Please send <b>₦${flow.fiatAmount.toLocaleString()}</b> to:

<b>Bank:</b> ${process.env.BANK_NAME || 'XYZ Bank'}
<b>Account Name:</b> ${process.env.ACCOUNT_NAME || 'Your Account'}
<b>Account Number:</b> <code>${process.env.ACCOUNT_NUMBER || '0123456789'}</code>

<b>⚠️ IMPORTANT:</b> Include <code>${order.orderRef}</code> in the transfer narration/description.

After sending, tap the button below to notify us.
  `;

  await ctx.reply(bankDetails, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ I\'ve paid', `claim_payment_${order.orderRef}`)]
    ])
  });

  // Send a separate message to reset the keyboard back to the main menu
  await ctx.reply('Use the menu below to continue:', { ...mainMenu() });

  ctx.session.orderFlow = null;
  ctx.session.step = null;
  ctx.session.currentOrderRef = order.orderRef;
}

module.exports = {
  buyHandler,
  handleAmountEntry,
  handleChainSelection,
  handleWalletEntry,
  handleConfirm
};