const User = require('../../models/User');
const { getRate } = require('../../services/rateService');
const { createOrder } = require('../../services/orderService');
const { notifyAdminNewOrder } = require('../../services/notificationService');
const { COINS, NETWORKS } = require('../../utils/constants');
const { coinMenu, networkMenu, confirmMenu, mainMenu } = require('../keyboards/mainMenu');

async function buyHandler(ctx) {
  ctx.session.orderFlow = { type: 'BUY' };
  const coinList = Object.values(COINS);
  const keyboard = coinMenu();

  await ctx.reply('Select a coin to buy:', keyboard);
  ctx.session.step = 'SELECT_COIN';
}

async function handleCoinSelection(ctx) {
  const coin = ctx.message.text.trim();

  if (!Object.values(COINS).includes(coin)) {
    return ctx.reply('Invalid coin. Please select from the menu.', coinMenu());
  }

  ctx.session.orderFlow.coin = coin;
  ctx.session.step = 'SELECT_NETWORK';

  const keyboard = networkMenu();
  await ctx.reply(`Selected: <b>${coin}</b>\n\nSelect network:`, {
    parse_mode: 'HTML',
    ...keyboard
  });
}

async function handleNetworkSelection(ctx) {
  const network = ctx.message.text.trim();

  if (!Object.values(NETWORKS).includes(network)) {
    return ctx.reply('Invalid network. Please select from the menu.', networkMenu());
  }

  ctx.session.orderFlow.network = network;
  ctx.session.step = 'ENTER_AMOUNT';

  await ctx.reply(`Selected: <b>${network}</b>\n\nHow much ${ctx.session.orderFlow.coin} do you want to buy?\n\n(Enter amount as a number)`, {
    parse_mode: 'HTML'
  });
}

async function handleAmountEntry(ctx) {
  const amount = parseFloat(ctx.message.text);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Invalid amount. Please enter a valid number.');
  }

  ctx.session.orderFlow.cryptoAmount = amount;
  ctx.session.step = 'CONFIRM_ORDER';

  const coin = ctx.session.orderFlow.coin;
  const rate = await getRate(coin);

  if (!rate) {
    return ctx.reply('Rate not available. Try again later.');
  }

  const nairaAmount = Math.floor(amount * rate.buyRate);

  ctx.session.orderFlow.rate = rate.buyRate;
  ctx.session.orderFlow.nairaAmount = nairaAmount;

  const summary = `
<b>Order Summary</b>

Coin: <b>${coin}</b>
Amount: <b>${amount} ${coin}</b>
Network: <b>${ctx.session.orderFlow.network}</b>
Rate: <b>₦${rate.buyRate.toLocaleString()}</b>
Total Naira: <b>₦${nairaAmount.toLocaleString()}</b>

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
    return ctx.reply('Order cancelled.', mainMenu());
  }

  const user = await User.findOne({ telegramId: ctx.from.id });
  const order = await createOrder(
    user._id,
    ctx.session.orderFlow.type,
    ctx.session.orderFlow.coin,
    ctx.session.orderFlow.network,
    ctx.session.orderFlow.cryptoAmount,
    ctx.session.orderFlow.rate
  );

  await notifyAdminNewOrder(ctx, order, user);

  const bankDetails = `
✅ <b>Order Created Successfully!</b>

<b>Order Reference:</b> <code>${order.orderRef}</code>

Please send payment to:

<b>Bank:</b> ${process.env.BANK_NAME || 'XYZ Bank'}
<b>Account Name:</b> ${process.env.ACCOUNT_NAME || 'Your Account'}
<b>Account Number:</b> <code>${process.env.ACCOUNT_NUMBER || '0123456789'}</code>

Amount: ₦${order.nairaAmount.toLocaleString()}

After payment, upload a screenshot of the receipt.
  `;

  await ctx.reply(bankDetails, { parse_mode: 'HTML', ...mainMenu() });

  ctx.session.orderFlow = null;
  ctx.session.step = null;
  ctx.session.currentOrder = order._id.toString();
}

module.exports = {
  buyHandler,
  handleCoinSelection,
  handleNetworkSelection,
  handleAmountEntry,
  handleConfirm
};
