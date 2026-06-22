const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../utils/constants');

async function recordPaymentUpload(orderId, receiptFileId) {
  const payment = await Payment.create({
    orderId,
    receiptFileId,
    status: 'PENDING'
  });

  await Order.findByIdAndUpdate(orderId, {
    status: ORDER_STATUS.PAYMENT_UPLOADED,
    receiptFileId
  });

  return payment;
}

async function verifyPayment(orderId) {
  return Payment.findOneAndUpdate(
    { orderId },
    { status: 'VERIFIED' },
    { new: true }
  );
}

async function rejectPayment(orderId) {
  await Payment.findOneAndUpdate(
    { orderId },
    { status: 'REJECTED' }
  );

  return Order.findByIdAndUpdate(orderId, {
    status: ORDER_STATUS.REJECTED
  });
}

async function getPaymentByOrderId(orderId) {
  return Payment.findOne({ orderId });
}

module.exports = {
  recordPaymentUpload,
  verifyPayment,
  rejectPayment,
  getPaymentByOrderId
};
