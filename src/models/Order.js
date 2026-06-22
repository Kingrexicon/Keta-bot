const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderRef: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  coin: {
    type: String,
    enum: ['USDT', 'BTC', 'ETH'],
    required: true
  },
  network: {
    type: String,
    enum: ['TRC20', 'BEP20'],
    required: true
  },
  cryptoAmount: {
    type: Number,
    required: true
  },
  nairaAmount: {
    type: Number,
    required: true
  },
  rate: {
    type: Number,
    required: true
  },
  fee: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['WAITING_PAYMENT', 'PAYMENT_UPLOADED', 'PAYMENT_VERIFIED', 'CRYPTO_SENT', 'COMPLETED', 'EXPIRED', 'REJECTED'],
    default: 'WAITING_PAYMENT',
    index: true
  },
  walletAddress: String,
  receiptFileId: String,
  expiresAt: {
    type: Date,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('Order', orderSchema);
