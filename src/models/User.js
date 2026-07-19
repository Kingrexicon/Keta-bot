const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  username: String,
  firstName: String,
  phoneNumber: String,
  kycStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED'],
    default: 'PENDING'
  },
  kycVerifiedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
