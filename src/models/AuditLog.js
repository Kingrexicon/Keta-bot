const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  orderRef: String,
  action: {
    type: String,
    required: true,
    enum: ['ORDER_CREATED', 'PAYMENT_UPLOADED', 'PAYMENT_VERIFIED', 'CRYPTO_SENT', 'COMPLETED', 'EXPIRED', 'REJECTED']
  },
  actor: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
