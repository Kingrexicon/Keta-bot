const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    default: ''
  },
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Admin', adminSchema);