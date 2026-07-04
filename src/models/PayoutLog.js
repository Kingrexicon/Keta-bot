const mongoose = require('mongoose');

const payoutLogSchema = new mongoose.Schema({
  orderRef: {
    type: String,
    required: true,
    index: true
  },
  cryptoAmount: {
    type: Number,
    required: true
  },
  chain: {
    type: String,
    required: true
  },
  walletAddress: {
    type: String,
    required: true
  },
  adminId: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    required: true
  },
  txHash: {
    type: String,
    default: ''
  },
  error: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PayoutLog', payoutLogSchema);