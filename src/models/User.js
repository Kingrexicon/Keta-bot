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
  surname: String,
  otherNames: String,
  phoneNumber: String,
  phoneVerifiedViaTelegram: {
    type: Boolean,
    default: false
  },
  email: String,
  gender: {
    type: String,
    enum: ['Male', 'Female'],
    default: null
  },
  // BVN verification (via Anchor)
  bvnVerifiedAt: Date,
  bvnReference: String,
  bvnConsentAt: Date,
  anchorCustomerId: String,
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