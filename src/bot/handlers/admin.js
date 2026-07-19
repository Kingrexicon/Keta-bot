const Order = require('../../models/Order');
const Admin = require('../../models/Admin');
const User = require('../../models/User');
const { setRate, getRate } = require('../../services/rateService');
const { ORDER_STATUS } = require('../../utils/constants');
const { isAdminUser } = require('./payment');
const { checkNativeBalance, checkTokenBalance } = require('../../services/payoutService');
const { ethers } = require('ethers');

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

/**
 * Check hot wallet balances across all supported chains
 * Command: /balances
 */
async function balanceHandler(ctx) {
  if (!(await isAdminUser(ctx.from.id))) {
    return ctx.reply('❌ Unauthorized. Admin only.');
  }

  await ctx.reply('🔍 Checking wallet balances across all chains...');

  try {
    const privateKey = process.env.EVM_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      return ctx.reply('❌ EVM_WALLET_PRIVATE_KEY not configured.');
    }

    // Derive wallet address from private key (same address on all EVM chains)
    const wallet = new ethers.Wallet(privateKey);
    const walletAddress = wallet.address;

    const baseRpc = process.env.BASE_MAINNET_RPC_URL;
    const ethRpc = process.env.ETH_MAINNET_RPC_URL;

    // USDC contract on Base Mainnet
    const USDC_BASE_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    // USDT contract on Ethereum Mainnet
    const USDT_ERC20_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

    // Query all balances in parallel
    const [baseEth, baseUsdc, ethEth, ethUsdt] = await Promise.all([
      baseRpc ? checkNativeBalance(walletAddress, baseRpc) : Promise.resolve('N/A'),
      baseRpc ? checkTokenBalance(walletAddress, USDC_BASE_CONTRACT, baseRpc) : Promise.resolve('N/A'),
      ethRpc ? checkNativeBalance(walletAddress, ethRpc) : Promise.resolve('N/A'),
      ethRpc ? checkTokenBalance(walletAddress, USDT_ERC20_CONTRACT, ethRpc) : Promise.resolve('N/A')
    ]);

    const message = `
💰 <b>Hot Wallet Balances</b>

<code>${walletAddress}</code>

<b>Base Mainnet:</b>
  ETH (gas): ${parseFloat(baseEth).toFixed(6)}
  USDC: ${parseFloat(baseUsdc).toFixed(2)}

<b>Ethereum Mainnet:</b>
  ETH (gas): ${parseFloat(ethEth).toFixed(6)}
  USDT: ${parseFloat(ethUsdt).toFixed(2)}
    `;

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    await ctx.reply(`❌ Error checking balances: ${error.message}`);
  }
}

async function verifyUserHandler(ctx) {
  if (!(await isAdminUser(ctx.from.id))) {
    return ctx.reply('❌ Unauthorized. Admin only.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Usage: /verifyuser <telegramId>');
  }

  const telegramId = parseInt(args[1]);
  if (isNaN(telegramId)) {
    return ctx.reply('Invalid Telegram ID. Please enter a numeric ID.');
  }

  const user = await User.findOne({ telegramId });
  if (!user) {
    return ctx.reply(`User not found for Telegram ID: ${telegramId}`);
  }

  const prevStatus = user.kycStatus;
  user.kycStatus = 'VERIFIED';
  user.kycVerifiedAt = new Date();
  await user.save();

  await ctx.reply(
    `✅ <b>User KYC Updated</b>\n\nTelegram ID: <code>${telegramId}</code>\nUsername: @${user.username || 'N/A'}\nPrevious Status: ${prevStatus}\nNew Status: VERIFIED\nVerified At: ${user.kycVerifiedAt.toLocaleString()}`,
    { parse_mode: 'HTML' }
  );
}

module.exports = {
  pendingOrdersHandler,
  setrateHandler,
  statsHandler,
  balanceHandler,
  verifyUserHandler
};
