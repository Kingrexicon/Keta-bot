const { Markup } = require('telegraf');

/**
 * Notify admin group about a new order
 */
async function notifyAdminNewOrder(ctx, order, user) {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) return;

  const message = `
📝 <b>NEW ORDER CREATED</b>

<b>Order:</b> <code>${order.orderRef}</code>
<b>User:</b> @${user.username || user.id}
<b>Chain:</b> ${order.chain}
<b>Amount:</b> ₦${order.fiatAmount.toLocaleString()}
<b>Crypto:</b> ${order.cryptoAmount} ${order.chain.split('-')[0]}
<b>Wallet:</b> <code>${order.walletAddress}</code>
<b>Status:</b> Pending payment
  `;

  await ctx.telegram.sendMessage(adminGroupId, message, { parse_mode: 'HTML' });
}

/**
 * Notify admin group that a client has claimed payment sent
 * Includes "Confirm Payment" button
 */
async function notifyAdminPaymentClaimed(ctx, order, user) {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) return;

  const message = `
🔔 <b>PAYMENT CLAIMED</b>

<b>Order:</b> <code>${order.orderRef}</code>
<b>User:</b> @${user.username || user.id}
<b>Chain:</b> ${order.chain}
<b>Amount:</b> ₦${order.fiatAmount.toLocaleString()}
<b>Crypto:</b> ${order.cryptoAmount} ${order.chain.split('-')[0]}
<b>Wallet:</b> <code>${order.walletAddress}</code>
<b>Expected Reference:</b> <code>${order.orderRef}</code>

Check your bank app for a matching transfer, then confirm.
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirm Payment', `confirm_payment_${order.orderRef}`)]
  ]);

  await ctx.telegram.sendMessage(adminGroupId, message, {
    parse_mode: 'HTML',
    ...keyboard
  });
}

/**
 * Notify user that their payment is under review
 */
async function notifyUserPaymentUnderReview(ctx, userId, orderRef) {
  const message = `⏳ <b>Payment Under Review</b>\n\nYour payment for order <code>${orderRef}</code> has been received and is being reviewed by an admin. We'll notify you once it's confirmed.`;

  try {
    await ctx.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`Failed to notify user ${userId}:`, error.message);
  }
}

/**
 * Notify user that their payment has been verified and crypto will be released
 */
async function notifyUserPaymentVerified(ctx, userId, orderRef) {
  const message = `✅ <b>Payment Verified!</b>\n\nYour payment for order <code>${orderRef}</code> has been confirmed. The crypto will be released to your wallet shortly.`;

  try {
    await ctx.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`Failed to notify user ${userId}:`, error.message);
  }
}

/**
 * Notify user that crypto has been released with tx hash
 */
async function notifyUserCryptoReleased(ctx, userId, orderRef, txHash, chain) {
  const explorerLink = getExplorerLink(txHash, chain);
  const message = `
🚀 <b>Crypto Released!</b>

Your crypto for order <code>${orderRef}</code> has been sent.

<b>Transaction Hash:</b> <code>${txHash}</code>
${explorerLink ? `\n<b>View on explorer:</b> ${explorerLink}` : ''}

Thank you for using KetaBot!
  `;

  try {
    await ctx.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`Failed to notify user ${userId}:`, error.message);
  }
}

/**
 * Notify user that their order has expired
 */
async function notifyUserOrderExpired(ctx, userId, orderRef) {
  const message = `⏰ <b>Order Expired</b>\n\nOrder <code>${orderRef}</code> has expired. Payment was not received within the time limit.`;

  try {
    await ctx.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`Failed to notify user ${userId}:`, error.message);
  }
}

/**
 * Notify admin group about a payout failure
 */
async function notifyAdminPayoutFailed(ctx, order, errorMessage) {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) return;

  const message = `
⚠️ <b>PAYOUT FAILED</b>

<b>Order:</b> <code>${order.orderRef}</code>
<b>Chain:</b> ${order.chain}
<b>Amount:</b> ${order.cryptoAmount} ${order.chain.split('-')[0]}
<b>Wallet:</b> <code>${order.walletAddress}</code>
<b>Error:</b> ${errorMessage}

<b>Manual intervention required.</b>
  `;

  await ctx.telegram.sendMessage(adminGroupId, message, { parse_mode: 'HTML' });
}

/**
 * Get a block explorer link for a transaction hash
 */
function getExplorerLink(txHash, chain) {
  switch (chain) {
    case 'BTC':
      return `https://blockstream.info/tx/${txHash}`;
    case 'ETH':
      return `https://etherscan.io/tx/${txHash}`;
    case 'USDT-TRC20':
    case 'USDC-TRC20':
      return `https://tronscan.org/#/transaction/${txHash}`;
    case 'USDT-BEP20':
    case 'USDC-BEP20':
      return `https://bscscan.com/tx/${txHash}`;
    default:
      return '';
  }
}

module.exports = {
  notifyAdminNewOrder,
  notifyAdminPaymentClaimed,
  notifyUserPaymentUnderReview,
  notifyUserPaymentVerified,
  notifyUserCryptoReleased,
  notifyUserOrderExpired,
  notifyAdminPayoutFailed
};