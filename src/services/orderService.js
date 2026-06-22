const Order = require('../models/Order');
const AuditLog = require('../models/AuditLog');
const { generateOrderRef } = require('../utils/validators');
const { ORDER_EXPIRY_MINUTES, ORDER_STATUS, FEE } = require('../utils/constants');

async function createOrder(userId, type, coin, network, cryptoAmount, rate) {
  const orderRef = generateOrderRef();
  const nairaAmount = Math.floor(cryptoAmount * rate);
  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000);

  const order = new Order({
    orderRef,
    userId,
    type,
    coin,
    network,
    cryptoAmount,
    nairaAmount,
    rate,
    fee: FEE,
    status: ORDER_STATUS.WAITING_PAYMENT,
    expiresAt
  });

  await order.save();

  await AuditLog.create({
    userId,
    orderRef,
    action: 'ORDER_CREATED',
    actor: 'user',
    details: { type, coin, network, amount: cryptoAmount }
  });

  return order;
}

async function getOrderByRef(orderRef) {
  return Order.findOne({ orderRef }).populate('userId');
}

async function updateOrderStatus(orderRef, status, details = {}) {
  const order = await Order.findOneAndUpdate(
    { orderRef },
    { status },
    { new: true }
  );

  if (order) {
    await AuditLog.create({
      userId: order.userId,
      orderRef,
      action: status === ORDER_STATUS.PAYMENT_UPLOADED ? 'PAYMENT_UPLOADED' : status,
      actor: 'system',
      details
    });
  }

  return order;
}

async function getPendingOrders() {
  return Order.find({ status: ORDER_STATUS.WAITING_PAYMENT }).populate('userId');
}

async function getExpiredOrders() {
  return Order.find({
    status: ORDER_STATUS.WAITING_PAYMENT,
    expiresAt: { $lt: new Date() }
  });
}

async function expireOrders() {
  const expired = await getExpiredOrders();

  for (const order of expired) {
    await updateOrderStatus(order.orderRef, ORDER_STATUS.EXPIRED, { reason: 'Payment not received within 30 minutes' });
  }

  return expired.length;
}

module.exports = {
  createOrder,
  getOrderByRef,
  updateOrderStatus,
  getPendingOrders,
  getExpiredOrders,
  expireOrders
};
