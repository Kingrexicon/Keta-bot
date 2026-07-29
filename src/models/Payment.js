const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
    index: true
  },
  orderRef: {
    type: String,
    index: true
  },
  clientTelegramId: {
    type: Number,
    index: true
  },
  clientUsername: String,
  receiptFileId: {
    type: String,
    default: ''
  },
  receiptImage: {
    type: Buffer,
    default: null
  },
  receiptMimeType: {
    type: String,
    default: ''
  },
  receiptFileSize: {
    type: Number,
    default: 0
  },
  receiptWidth: {
    type: Number,
    default: 0
  },
  receiptHeight: {
    type: Number,
    default: 0
  },
  uploadedBy: {
    type: Number,
    default: null
  },
  uploadedByUsername: {
    type: String,
    default: ''
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  driveFileId: {
    type: String,
    default: ''
  },
  driveFileLink: {
    type: String,
    default: ''
  },
  amount: Number,
  status: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED'],
    default: 'PENDING'
  },
  verifiedBy: {
    type: Number,
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  rejectedBy: {
    type: Number,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  }
});

// Compound index for efficient queries
paymentSchema.index({ orderRef: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);