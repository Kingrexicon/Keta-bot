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
    [Markup.button.callback('✅ Confirm Payment', `confirm_payment_${order.orderRef}`)],
    [Markup.button.callback('❌ Reject', `reject_payment_${order.orderRef}`)]
  ]);
  

  await ctx.telegram.sendMessage(adminGroupId, message, {
    parse_mode: 'HTML',
    ...keyboard
  });
}

/**
 * Notify the admin group when a user cancels a payment claim.
 */
async function notifyAdminPaymentClaimCancelled(ctx, order) {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) return;

  const message = `
<b>PAYMENT CLAIM CANCELLED</b>

<b>Order:</b> <code>${order.orderRef}</code>
<b>User:</b> @${order.clientUsername || order.clientTelegramId}
<b>Amount:</b> NGN ${order.fiatAmount.toLocaleString()}
<b>Status:</b> Pending payment

The user cancelled their payment claim and may claim payment again.
  `;

  try {
    await ctx.telegram.sendMessage(adminGroupId, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`Failed to notify admin about cancelled claim ${order.orderRef}:`, error.message);
  }
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
 * Notify user that their payment claim was rejected by admin
 */
async function notifyUserPaymentRejected(ctx, userId, orderRef) {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("I've paid", `claim_payment_${orderRef}`)],
    [Markup.button.callback('New Transaction', 'restart_bot')],
    [Markup.button.url('Contact Keta Support', 'https://wa.me/2349020761615?text=Hello%20KETA.NG')]
  ]);
  const message = `❌ <b>Payment Claim Rejected</b>\n\nYour claim for order <code>${orderRef}</code> was not confirmed. If you sent the payment, please try again with the correct payement receipt or contact support.`;
  try {
    await ctx.telegram.sendMessage(userId, message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    console.error(`Failed to notify user ${userId}:`, error.message);
  }
}

/**
 * Notify admin group about an expired order with resurrect button
 */
async function notifyAdminOrderExpired(ctx, order, adminGroupId) {
  const message = `
⏰ <b>ORDER EXPIRED</b>

<b>Order:</b> <code>${order.orderRef}</code>
<b>User:</b> @${order.clientUsername || order.clientTelegramId}
<b>Chain:</b> ${order.chain}
<b>Amount:</b> ₦${order.fiatAmount.toLocaleString()}
<b>Crypto:</b> ${order.cryptoAmount} ${order.chain.split('-')[0]}
<b>Status:</b> Expired (no action taken)

If the user actually paid, you can resurrect this order.
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Resurrect Order', `resurrect_order_${order.orderRef}`)]
  ]);

  try {
    await ctx.telegram.sendMessage(adminGroupId, message, {
      parse_mode: 'HTML',
      ...keyboard
    });
  } catch (error) {
    console.error(`Failed to notify admin group about expired order:`, error.message);
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
    case 'USDC-BASE':
      return `https://basescan.org/tx/${txHash}`;
    case 'ETH-ERC20':
    case 'USDT-ERC20':
      return `https://etherscan.io/tx/${txHash}`;
    default:
      return '';
  }
}

module.exports = {
  notifyAdminNewOrder,
  notifyAdminPaymentClaimed,
  notifyAdminPaymentClaimCancelled,
  notifyUserPaymentUnderReview,
  notifyUserPaymentVerified,
  notifyUserCryptoReleased,
  notifyUserOrderExpired,
  notifyUserPaymentRejected,
  notifyAdminOrderExpired,
  notifyAdminPayoutFailed
};
