const Order = require('../../models/Order');
const Admin = require('../../models/Admin');
const { claimPayment, verifyOrder, releaseOrder, rollbackRelease, failOrder, setTxHash, setReleaseButtonInfo, logPayoutAttempt } = require('../../services/orderService');
const { releaseCrypto } = require('../../services/paymentService');
const { notifyAdminPaymentClaimed, notifyUserPaymentUnderReview, notifyUserPaymentVerified, notifyUserCryptoReleased, notifyAdminPayoutFailed } = require('../../services/notificationService');
const { Markup } = require('telegraf');

/**
 * Check if a Telegram user is an authorized admin (server-side DB check)
 */
async function isAdminUser(telegramId) {
  const admin = await Admin.findOne({ telegramId, active: true });
  return admin !== null;
}

/**
 * Handle "I've paid" button — client claims they sent the money
 * Called via callback_query: claim_payment_{orderRef}
 */
async function handleClaimPayment(ctx) {
  const orderRef = ctx.callbackQuery.data.replace('claim_payment_', '');

  const order = await Order.findOne({ orderRef });

  if (!order) {
    return ctx.answerCbQuery('❌ Order not found.');
  }

  if (order.clientTelegramId !== ctx.from.id) {
    return ctx.answerCbQuery('❌ This order does not belong to you.');
  }

  // Atomic status guard: only pending orders can be claimed
  const updated = await claimPayment(orderRef, ctx.from.id);

  if (!updated) {
    return ctx.answerCbQuery('❌ Order has already been processed or has expired.');
  }

  await ctx.answerCbQuery('✅ Payment claim submitted! Under review.');

  // Edit the client's message to show it's been submitted
  await ctx.editMessageText(
    `${ctx.callbackQuery.message.text}\n\n⏳ <b>Your payment claim has been submitted and is under review.</b>`,
    { parse_mode: 'HTML' }
  );

  // Notify admin group
  await notifyAdminPaymentClaimed(ctx, updated, ctx.from);

  // Notify user
  await notifyUserPaymentUnderReview(ctx, ctx.from.id, orderRef);
}

/**
 * Handle "Confirm Payment" button — admin confirms they saw the bank alert
 * Called via callback_query: confirm_payment_{orderRef}
 */
async function handleConfirmPayment(ctx) {
  // Re-check admin authorization server-side on every callback
  if (!(await isAdminUser(ctx.from.id))) {
    return ctx.answerCbQuery('❌ Unauthorized. Admin only.');
  }

  const orderRef = ctx.callbackQuery.data.replace('confirm_payment_', '');

  // Atomic status guard: only payment_claimed orders can be verified
  const updated = await verifyOrder(orderRef, ctx.from.id);

  if (!updated) {
    return ctx.answerCbQuery('❌ Order is not in a claimable state or already processed.');
  }

  // Edit admin message: replace "Confirm Payment" button with "Release Crypto"
  const releaseButtonMessage = `
🔔 <b>PAYMENT VERIFIED</b>

<b>Order:</b> <code>${updated.orderRef}</code>
<b>User:</b> @${updated.clientUsername || updated.clientTelegramId}
<b>Chain:</b> ${updated.chain}
<b>Amount:</b> ₦${updated.fiatAmount.toLocaleString()}
<b>Crypto:</b> ${updated.cryptoAmount} ${updated.chain.split('-')[0]}
<b>Wallet:</b> <code>${updated.walletAddress}</code>
<b>Verified by:</b> @${ctx.from.username || ctx.from.id}

Tap "Release Crypto" to send the crypto to the user's wallet.
  `;

  const releaseKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Release Crypto', `release_crypto_${updated.orderRef}`)]
  ]);

  const sentMessage = await ctx.editMessageText(releaseButtonMessage, {
    parse_mode: 'HTML',
    ...releaseKeyboard
  });

  // Store the release button message info so we can edit it later
  await setReleaseButtonInfo(updated.orderRef, sentMessage.message_id, sentMessage.chat.id);

  await ctx.answerCbQuery('✅ Payment verified! Release button is now active.');

  // Notify the user
  await notifyUserPaymentVerified(ctx, updated.clientTelegramId, updated.orderRef);
}

/**
 * Handle "Release Crypto" button — admin triggers the payout
 * Called via callback_query: release_crypto_{orderRef}
 */
async function handleReleaseCrypto(ctx) {
  // Re-check admin authorization server-side (every callback, not cached)
  if (!(await isAdminUser(ctx.from.id))) {
    return ctx.answerCbQuery('❌ Unauthorized. Admin only.');
  }

  const orderRef = ctx.callbackQuery.data.replace('release_crypto_', '');

  // Immediately disable the button before the payout call, to prevent double-tap
  await ctx.editMessageText(
    `${ctx.callbackQuery.message.text}\n\n⏳ <b>Processing release...</b>`,
    { parse_mode: 'HTML' }
  );

  // Atomic status guard: only 'verified' orders can transition to 'released'
  const order = await releaseOrder(orderRef, ctx.from.id);

  if (!order) {
    // Atomic update returned null — order is no longer in 'verified' state
    await ctx.editMessageText(
      `${ctx.callbackQuery.message.text}\n\n❌ <b>Already processed.</b>`,
      { parse_mode: 'HTML' }
    );
    return ctx.answerCbQuery('❌ Order already processed.');
  }

  // Now attempt the actual crypto release
  let payoutResult;
  try {
    payoutResult = await releaseCrypto(order);
  } catch (error) {
    // Payout failed — rollback status to 'verified' so admin can retry
    await rollbackRelease(orderRef);
    await failOrder(orderRef, error.message);

    // Log the failure
    await logPayoutAttempt(orderRef, order.cryptoAmount, order.chain, order.walletAddress, ctx.from.id, 'failed', '', error.message);

    // Re-enable the release button so admin can retry
    const retryKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Release Crypto (Retry)', `release_crypto_${orderRef}`)]
    ]);

    await ctx.editMessageText(
      `⚠️ <b>PAYOUT FAILED</b>\n\n<b>Order:</b> <code>${orderRef}</code>\n<b>Error:</b> ${error.message}\n\nTap "Release Crypto" to retry.`,
      { parse_mode: 'HTML', ...retryKeyboard }
    );

    // Notify admin group explicitly about the failure
    await notifyAdminPayoutFailed(ctx, order, error.message);

    return ctx.answerCbQuery('❌ Payout failed. Check admin chat for details.');
  }

  // Payout succeeded
  if (payoutResult.success && payoutResult.txHash) {
    await setTxHash(orderRef, payoutResult.txHash);

    // Log the success
    await logPayoutAttempt(orderRef, order.cryptoAmount, order.chain, order.walletAddress, ctx.from.id, 'success', payoutResult.txHash, '');

    // Edit admin message to show success
    await ctx.editMessageText(
      `✅ <b>CRYPTO RELEASED</b>\n\n<b>Order:</b> <code>${orderRef}</code>\n<b>Released by:</b> @${ctx.from.username || ctx.from.id}\n<b>Tx Hash:</b> <code>${payoutResult.txHash}</code>`,
      { parse_mode: 'HTML' }
    );

    // Notify the user with tx hash
    await notifyUserCryptoReleased(ctx, order.clientTelegramId, orderRef, payoutResult.txHash, order.chain);

    await ctx.answerCbQuery('✅ Crypto released successfully!');
  } else {
    // Payout returned success: false without throwing — treat as failure
    await rollbackRelease(orderRef);
    const errorMsg = payoutResult.error || 'Unknown payout error';
    await failOrder(orderRef, errorMsg);

    await logPayoutAttempt(orderRef, order.cryptoAmount, order.chain, order.walletAddress, ctx.from.id, 'failed', '', errorMsg);

    const retryKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Release Crypto (Retry)', `release_crypto_${orderRef}`)]
    ]);

    await ctx.editMessageText(
      `⚠️ <b>PAYOUT FAILED</b>\n\n<b>Order:</b> <code>${orderRef}</code>\n<b>Error:</b> ${errorMsg}\n\nTap "Release Crypto" to retry.`,
      { parse_mode: 'HTML', ...retryKeyboard }
    );

    await notifyAdminPayoutFailed(ctx, order, errorMsg);
    await ctx.answerCbQuery('❌ Payout failed.');
  }
}

module.exports = {
  handleClaimPayment,
  handleConfirmPayment,
  handleReleaseCrypto,
  isAdminUser
};