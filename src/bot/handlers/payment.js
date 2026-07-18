const Order = require('../../models/Order');
const Admin = require('../../models/Admin');
const { claimPayment, rejectPayment, cancelClaim, verifyOrder, releaseOrder, rollbackRelease, failOrder, setTxHash, setReleaseButtonInfo, logPayoutAttempt, resurrectOrder } = require('../../services/orderService');
const { releaseCrypto } = require('../../services/paymentService');
const { notifyAdminPaymentClaimed, notifyUserPaymentUnderReview, notifyUserPaymentVerified, notifyUserCryptoReleased, notifyUserPaymentRejected, notifyAdminPayoutFailed } = require('../../services/notificationService');
const { Markup } = require('telegraf');

/**
 * Check if a Telegram user is an authorized admin (server-side DB check)
 * Falls back to ADMIN_IDS env variable if not found in DB
 */
async function isAdminUser(telegramId) {
  // Check DB first
  const admin = await Admin.findOne({ telegramId, active: true });
  if (admin) return true;

  // Fallback: check ADMIN_IDS env variable
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  return adminIds.includes(telegramId);
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

  // Check if order is still pending
  if (order.status !== 'pending') {
    return ctx.answerCbQuery('❌ Order has already been processed or has expired.');
  }

  await ctx.answerCbQuery('✅ Please send your payment receipt.');

  // Store the orderRef in session to track receipt submission
  ctx.session.awaitingReceiptOrderRef = orderRef;

  // Ask user to send receipt
  await ctx.reply(
    '📸 <b>Please send a screenshot or photo of your payment receipt/confirmation as proof of payment.</b>\n\nThis will be reviewed by an admin.',
    { parse_mode: 'HTML' }
  );
}

/**
 * Handle "Reject Payment" button — admin rejects the user's payment claim
 * Resets order back to 'pending' so user can retry
 * Called via callback_query: reject_payment_{orderRef}
 */
async function handleRejectPayment(ctx) {
  if (!(await isAdminUser(ctx.from.id))) {
    return ctx.answerCbQuery('❌ Unauthorized. Admin only.');
  }

  const orderRef = ctx.callbackQuery.data.replace('reject_payment_', '');

  const updated = await rejectPayment(orderRef, ctx.from.id);

  if (!updated) {
    return ctx.answerCbQuery('❌ Order is not in a claimable state or already processed.');
  }

  // Edit admin message to show it was rejected
  await ctx.editMessageText(
    `❌ <b>PAYMENT REJECTED</b>\n\n<b>Order:</b> <code>${orderRef}</code>\n<b>Rejected by:</b> @${ctx.from.username || ctx.from.id}\n\nOrder has been reset to pending. The user can retry.`,
    { parse_mode: 'HTML' }
  );

  // Notify the user
  await notifyUserPaymentRejected(ctx, updated.clientTelegramId, orderRef);

  await ctx.answerCbQuery('❌ Payment rejected. User has been notified.');
}

/**
 * Handle "Resurrect Order" button — admin revives an expired order
 * Called via callback_query: resurrect_order_{orderRef}
 */
async function handleResurrectOrder(ctx) {
  if (!(await isAdminUser(ctx.from.id))) {
    return ctx.answerCbQuery('❌ Unauthorized. Admin only.');
  }

  const orderRef = ctx.callbackQuery.data.replace('resurrect_order_', '');

  const updated = await resurrectOrder(orderRef, ctx.from.id);

  if (!updated) {
    return ctx.answerCbQuery('❌ Cannot resurrect. Order may have already been processed.');
  }

  // Edit admin message to show it's been resurrected
  await ctx.editMessageText(
    `🔄 <b>ORDER RESURRECTED</b>\n\n<b>Order:</b> <code>${orderRef}</code>\n<b>Resurrected by:</b> @${ctx.from.username || ctx.from.id}\n\nOrder is now pending again. The user can make a new payment claim.`,
    { parse_mode: 'HTML' }
  );

  await ctx.answerCbQuery('✅ Order resurrected. User can try again.');
}

/**
 * Handle "Cancel Claim" button — user cancels their own payment claim
 * Called via callback_query: cancel_claim_{orderRef}
 */
async function handleCancelClaim(ctx) {
  const orderRef = ctx.callbackQuery.data.replace('cancel_claim_', '');

  const updated = await cancelClaim(orderRef, ctx.from.id);

  if (!updated) {
    return ctx.answerCbQuery('❌ Cannot cancel. Order may have already been processed.');
  }

  // Edit the user's message to show it's been cancelled
  await ctx.editMessageText(
    `❌ <b>Claim Cancelled</b>\n\nYour payment claim for order <code>${orderRef}</code> has been cancelled. You can claim again after sending the payment.`,
    { parse_mode: 'HTML' }
  );

  await ctx.answerCbQuery('✅ Claim cancelled. You can try again.');
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

/**
 * Handle receipt submission — user sends photo after claiming payment
 */
async function handleReceiptSubmission(ctx) {
  const orderRef = ctx.session.awaitingReceiptOrderRef;

  if (!orderRef) {
    return ctx.reply('❌ No pending payment claim found. Please use "I\'ve paid" button on an order.');
  }

  // Get the photo file ID
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  try {
    // Update order status to payment_claimed (this marks it as claimed with proof)
    const updated = await claimPayment(orderRef, ctx.from.id);

    if (!updated) {
      return ctx.reply('❌ Order has already been processed or has expired.');
    }

    // Store the receipt file ID in Payment model
    const Payment = require('../../models/Payment');
    await Payment.findOneAndUpdate(
      { orderId: updated._id },
      { receiptFileId: fileId },
      { upsert: true }
    );

    // Clear the session
    delete ctx.session.awaitingReceiptOrderRef;

    // Acknowledge to user
    await ctx.reply('✅ Receipt received! Your payment is under review by our admin team.');

    // Notify admin with the receipt
    const adminGroupId = process.env.ADMIN_GROUP_ID;
    if (adminGroupId) {
      const order = updated;
      const adminMessage = `
🔔 <b>PAYMENT CLAIMED WITH RECEIPT</b>

<b>Order:</b> <code>${order.orderRef}</code>
<b>User:</b> @${ctx.from.username || ctx.from.id}
<b>Chain:</b> ${order.chain}
<b>Amount:</b> ₦${order.fiatAmount.toLocaleString()}
<b>Crypto:</b> ${order.cryptoAmount} ${order.chain.split('-')[0]}
<b>Wallet:</b> <code>${order.walletAddress}</code>
<b>Expected Reference:</b> <code>${order.orderRef}</code>

⬇️ Receipt photo attached below:
      `;

      // Send the admin message
      await ctx.telegram.sendMessage(adminGroupId, adminMessage, { parse_mode: 'HTML' });

      // Forward the receipt photo to admin group
      await ctx.telegram.forwardMessage(adminGroupId, ctx.from.id, ctx.message.message_id);

      // Send confirmation/rejection buttons
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirm Payment', `confirm_payment_${order.orderRef}`)],
        [Markup.button.callback('❌ Reject', `reject_payment_${order.orderRef}`)]
      ]);

      await ctx.telegram.sendMessage(adminGroupId, 'Check the receipt above, then confirm or reject:', {
        parse_mode: 'HTML',
        ...keyboard
      });
    }

    // Notify user with a cancel claim button
    await notifyUserPaymentUnderReview(ctx, ctx.from.id, orderRef);
    await ctx.reply(
      `If you made a mistake, you can cancel your claim:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel Claim', `cancel_claim_${orderRef}`)]
      ])
    );
  } catch (error) {
    console.error('Receipt submission error:', error.message);
    ctx.reply('❌ Error processing receipt. Please try again.');
  }
}

module.exports = {
  handleClaimPayment,
  handleRejectPayment,
  handleCancelClaim,
  handleConfirmPayment,
  handleReleaseCrypto,
  handleResurrectOrder,
  handleReceiptSubmission,
  isAdminUser
};
