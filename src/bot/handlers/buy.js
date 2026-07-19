const { Markup } = require('telegraf');
const { getRate } = require('../../services/rateService');
const { createOrder } = require('../../services/orderService');
const { notifyAdminNewOrder } = require('../../services/notificationService');
const { CHAINS } = require('../../utils/constants');
const { validateWalletAddress } = require('../../utils/validators');
const { chainMenu, cancelMenu, confirmMenu, mainMenu } = require('../keyboards/mainMenu');
const User = require('../../models/User');
const { MIN_BUY_USD, LARGE_BUY_USD_THRESHOLD, DEEPIDV_URL } = require('../../utils/constants');

async function buyHandler(ctx) {
  ctx.session.orderFlow = { type: 'BUY' };
  ctx.session.step = 'ENTER_AMOUNT';
  await ctx.reply(
    'How much worth of crypto in <b>$USD</b> do you want to buy? Enter amount as a number (e.g. 50)\n\n📌 Minimum buy is $20\n⚠️ Orders above $100 require identity verification',
    { parse_mode: 'HTML', ...cancelMenu() }
  );
}

async function handleAmountEntry(ctx) {
  const amount = ctx.message.text.trim();

  if (amount === 'Cancel') {
    ctx.session.orderFlow = null;
    ctx.session.step = null;
    return ctx.reply('Order cancelled.', { ...mainMenu() });
  }

  const usdAmount = parseFloat(amount);

  if (isNaN(usdAmount) || usdAmount <= 0) {
    return ctx.reply('Invalid amount. Please enter a valid number.', { ...cancelMenu() });
  }

  if (usdAmount < MIN_BUY_USD) {
    return ctx.reply(
      `❌ Minimum buy is <b>$${MIN_BUY_USD}</b>. Please enter a higher amount.`,
      { parse_mode: 'HTML', ...cancelMenu() }
    );
  }

  ctx.session.orderFlow.usdAmount = usdAmount;
  ctx.session.step = 'SELECT_CHAIN';

  await ctx.reply(
    `Buying: <b>~$${usdAmount.toLocaleString()}</b>\n\nSelect the chain for receiving crypto:`,
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

  const coin = chain.split('-')[0];
  const rate = await getRate(coin);

  if (!rate) {
    return ctx.reply('Rate not available. Try again later.');
  }

  const usdAmount = ctx.session.orderFlow.usdAmount;
  const fiatAmount = Math.floor(usdAmount * rate.buyRate / rate.usdPrice);
  const cryptoAmount = Math.floor((fiatAmount / rate.buyRate) * 10000) / 10000;

  // Verification check: only relevant if order is > $100
  if (usdAmount > LARGE_BUY_USD_THRESHOLD) {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user || user.kycStatus !== 'VERIFIED') {
      ctx.session.orderFlow = null;
      ctx.session.step = null;

      if (!user) {
        return ctx.reply(
          `❌ <b>Verification Required</b>\n\nOrders above <b>$${LARGE_BUY_USD_THRESHOLD}</b> require identity verification (DeepIDV).\n\nNo account found. Please use /start to create an account first, then verify your identity.`,
          { parse_mode: 'HTML', ...mainMenu() }
        );
      }

      return ctx.reply(
        `❌ <b>Verification Required</b>\n\nThis order is worth <b>~$${usdAmount}</b>, which is above the <b>$${LARGE_BUY_USD_THRESHOLD}</b> threshold.\n\nYou must complete <b>DeepIDV identity verification</b> before purchasing this amount.\n\nTap the button below to verify now:`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([
          [Markup.button.url('🔍 Verify with DeepIDV', DEEPIDV_URL)]
        ]) }
      );
    }
  }

  ctx.session.orderFlow.chain = chain;
  ctx.session.orderFlow.fiatAmount = fiatAmount;
  ctx.session.orderFlow.rate = rate.buyRate;
  ctx.session.orderFlow.cryptoAmount = cryptoAmount;
  ctx.session.step = 'ENTER_WALLET';

  await ctx.reply(
    `Selected: <b>${chain}</b>\n\nAmount you'll pay: <b>₦${fiatAmount.toLocaleString()}</b> (~$${usdAmount})

Enter your <b>${chain}</b> wallet address where you want to receive the crypto:`,
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

  const flow = ctx.session.orderFlow;

  const coin = chain.split('-')[0];

  const summary = `
<b>Order Summary</b>

Buying: <b>~$${flow.usdAmount}</b>
Amount to send: <b>₦${flow.fiatAmount.toLocaleString()}</b>
Chain: <b>${chain}</b>
You will receive: <b>${flow.cryptoAmount} ${coin}</b>
Rate: <b>₦${flow.rate.toLocaleString()}</b>
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