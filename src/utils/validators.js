const { v4: uuidv4 } = require('uuid');

function generateOrderRef() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${timestamp}${random}`;
}

function validateTRC20Address(address) {
  return /^T[a-zA-Z0-9]{33}$/.test(address);
}

function validateBEP20Address(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function validateBTCAddress(address) {
  return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address);
}

function validateWalletAddress(address, network) {
  switch (network) {
    case 'TRC20':
      return validateTRC20Address(address);
    case 'BEP20':
      return validateBEP20Address(address);
    default:
      return false;
  }
}

module.exports = {
  generateOrderRef,
  validateWalletAddress,
  validateTRC20Address,
  validateBEP20Address,
  validateBTCAddress
};
