const mongoose = require('mongoose');

const rateSchema = new mongoose.Schema({
  coin: {
    type: String,
    required: true,
    unique: true,
    enum: ['ETH', 'USDT', 'USDC'],
    index: true
  },
  buyRate: {
    type: Number,
    required: true
  },
  sellRate: {
    type: Number,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Rate', rateSchema);
