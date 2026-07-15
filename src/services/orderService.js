const Order = require('../models/Order');
const PayoutLog = require('../models/PayoutLog');
const { generateOrderRef } = require('../utils/validators');
const { ORDER_EXPIRY_MINUTES, ORDER_STATUS } = require('../utils/constants');

async function createOrder(clientTelegramId, clientUsername, chain, fiatAmount, exchangeRate) {
  const orderRef = await generateOrderRef();
  const cryptoAmount = Math.floor((fiatAmount / exchangeRate) * 10000) / 10000; // 4 decimal places
  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000);

  const order = new Order({
    orderRef,
    clientTelegramId,
    clientUsername,
    chain,
    fiatAmount,
    fiatCurrency: 'NGN',
    exchangeRate,
    cryptoAmount,
    status: ORDER_STATUS.PENDING,
    expiresAt
  });

  await order.save();
  return order;
}

/**
 * Atomic status-guarded update: client claims payment sent
 * Resets the expiry timer so admin gets a full window to respond
 */
async function claimPayment(orderRef, clientTelegramId) {
  const newExpiry = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000);
  const order = await Order.findOneAndUpdate(
    { orderRef, clientTelegramId, status: ORDER_STATUS.PENDING, expiresAt: { $gt: new Date() } },
    { $set: { status: ORDER_STATUS.PAYMENT_CLAIMED, paymentClaimedAt: new Date(), expiresAt: newExpiry } },
    { returnDocument: 'after' }
  );
  return order;
}

/**
 * Atomic status-guarded update: admin rejects payment claim (resets to pending)
 */
async function rejectPayment(orderRef, adminId) {
  const order = await Order.findOneAndUpdate(
    { orderRef, status: ORDER_STATUS.PAYMENT_CLAIMED },
    { $set: { status: ORDER_STATUS.PENDING, verifiedBy: adminId, verifiedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return order;
}

/**
 * Atomic status-guarded update: user cancels their own payment claim (resets to pending)
 */
async function cancelClaim(orderRef, clientTelegramId) {
  const order = await Order.findOneAndUpdate(
    { orderRef, clientTelegramId, status: ORDER_STATUS.PAYMENT_CLAIMED },
    { $set: { status: ORDER_STATUS.PENDING, paymentClaimedAt: null } },
    { returnDocument: 'after' }
  );
  return order;
}

/**
 * Atomic status-guarded update: admin verifies payment
 */
async function verifyOrder(orderRef, adminId) {
  const order = await Order.findOneAndUpdate(
    { orderRef, status: ORDER_STATUS.PAYMENT_CLAIMED },
    { $set: { status: ORDER_STATUS.VERIFIED, verifiedBy: adminId, verifiedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return order;
}

/**
 * Atomic status-guarded update: admin releases crypto
 * Returns the updated order, or null if the order was not in 'verified' state
 */
async function releaseOrder(orderRef, adminId) {
  const order = await Order.findOneAndUpdate(
    { orderRef, status: ORDER_STATUS.VERIFIED },
    { $set: { status: ORDER_STATUS.RELEASED, releasedBy: adminId, releasedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return order;
}

/**
 * Rollback release if payout fails — set status back to 'verified' so admin can retry
 */
async function rollbackRelease(orderRef) {
  const order = await Order.findOneAndUpdate(
    { orderRef, status: ORDER_STATUS.RELEASED },
    { $set: { status: ORDER_STATUS.VERIFIED, releasedBy: null, releasedAt: null } },
    { returnDocument: 'after' }
  );
  return order;
}

/**
 * Mark order as failed (payout error, needs manual retry)
 */
async function failOrder(orderRef, errorMessage) {
  const order = await Order.findOneAndUpdate(
    { orderRef },
    { $set: { status: ORDER_STATUS.FAILED, payoutError: errorMessage } },
    { returnDocument: 'after' }
  );
  return order;
}

/**
 * Update order with tx hash after successful payout
 */
async function setTxHash(orderRef, txHash) {
  return Order.findOneAndUpdate(
    { orderRef },
    { $set: { txHash } },
    { returnDocument: 'after' }
  );
}

/**
 * Store release button message info so we can edit/disable it later
 */
async function setReleaseButtonInfo(orderRef, messageId, chatId) {
  return Order.findOneAndUpdate(
    { orderRef },
    { $set: { releaseButtonMessageId: messageId, releaseButtonChatId: chatId } },
    { returnDocument: 'after' }
  );
}

/**
 * Get order by reference
 */
async function getOrderByRef(orderRef) {
  return Order.findOne({ orderRef });
}

/**
 * Get pending orders (for admin listing)
 */
async function getPendingOrders() {
  return Order.find({
    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.PAYMENT_CLAIMED] }
  }).sort({ createdAt: -1 });
}

/**
 * Expire stale pending and payment_claimed orders
 * Returns the list of expired orders (with clientTelegramId) so notifications can be sent
 */
async function expireOrders() {
  const expired = await Order.find(
    { status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.PAYMENT_CLAIMED] }, expiresAt: { $lt: new Date() } }
  );

  if (expired.length === 0) return [];

  const ids = expired.map(o => o._id);

  await Order.updateMany(
    { _id: { $in: ids } },
    { $set: { status: ORDER_STATUS.EXPIRED } }
  );

  return expired;
}

/**
 * Admin resurrects an expired order back to 'pending' status
 */
async function resurrectOrder(orderRef, adminId) {
  const order = await Order.findOneAndUpdate(
    { orderRef, status: ORDER_STATUS.EXPIRED },
    { $set: { status: ORDER_STATUS.PENDING, expiresAt: new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000), verifiedBy: adminId, verifiedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return order;
}

/**
 * Log a payout attempt (append-only audit trail)
 */
async function logPayoutAttempt(orderRef, cryptoAmount, chain, walletAddress, adminId, status, txHash, error) {
  return PayoutLog.create({
    orderRef,
    cryptoAmount,
    chain,
    walletAddress,
    adminId,
    status,
    txHash: txHash || '',
    error: error || ''
  });
}

module.exports = {
  createOrder,
  claimPayment,
  rejectPayment,
  cancelClaim,
  verifyOrder,
  releaseOrder,
  rollbackRelease,
  failOrder,
  setTxHash,
  setReleaseButtonInfo,
  getOrderByRef,
  getPendingOrders,
  expireOrders,
  resurrectOrder,
  logPayoutAttempt
};
