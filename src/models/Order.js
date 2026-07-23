const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderRef: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  clientTelegramId: {
    type: Number,
    required: true,
    index: true
  },
  clientUsername: {
    type: String,
    default: ''
  },
  walletAddress: {
    type: String,
    default: ''
  },
  exported: {
    type: Boolean,
    default: false,
    index: true
  },
  exportedAt: {
    type: Date,
    default: null
  },
  chain: {
    type: String,
    enum: ['USDC-BASE', 'ETH-ERC20', 'USDT-ERC20', 'USDT-SOL'],
    required: true
  },
  fiatAmount: {
    type: Number,
    required: true
  },
  fiatCurrency: {
    type: String,
    default: 'NGN'
  },
  exchangeRate: {
    type: Number,
    required: true
  },
  cryptoAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'payment_claimed', 'verified', 'released', 'expired', 'cancelled', 'failed'],
    default: 'pending',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    index: true
  },
  paymentClaimedAt: {
    type: Date
  },
  verifiedBy: {
    type: Number,
    default: null
  },
  verifiedAt: {
    type: Date
  },
  releasedBy: {
    type: Number,
    default: null
  },
  releasedAt: {
    type: Date
  },
  txHash: {
    type: String,
    default: ''
  },
  payoutError: {
    type: String,
    default: ''
  },
  bankReferenceSeen: {
    type: String,
    default: ''
  },
  releaseButtonMessageId: {
    type: Number,
    default: null
  },
  releaseButtonChatId: {
    type: Number,
    default: null
  }
});

// Indexes for efficient queries
orderSchema.index({ clientTelegramId: 1, status: 1 });
orderSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('Order', orderSchema);