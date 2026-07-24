/**
 * Generate order reference in format: KET + DDMMYY + sequentialNumber
 * Example: KET67261 = KET + 6/7/26 + order #1 that day
 */
async function generateOrderRef() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const dateStr = `${day}${month}${year}`;

  // Count today's orders to get the sequential number
  const Order = require('../models/Order');
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const count = await Order.countDocuments({
    createdAt: { $gte: todayStart, $lt: todayEnd }
  });

  const seqNum = count + 1;
  return `KET${dateStr}${seqNum}`;
}

/**
 * Validate Ethereum-style address (0x + 40 hex chars)
 * Works for both ERC-20 and Base Sepolia
 */
function validateEVMAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate Solana address (base58, 32-44 chars)
 * Works for Solana mainnet/devnet
 */
function validateSolanaAddress(address) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/**
 * Validate wallet address for a given chain.
 * Chain values: 'USDC-BASE', 'ETH-ERC20', 'USDT-ERC20', 'USDT-SOL'
 */
function validateWalletAddress(address, chain) {
  switch (chain) {
    case 'USDC-BASE':
    case 'ETH-ERC20':
    case 'USDT-ERC20':
      return validateEVMAddress(address);
    case 'USDT-SOL':
      return validateSolanaAddress(address);
    default:
      return false;
  }
}

module.exports = {
  generateOrderRef,
  validateWalletAddress,
  validateEVMAddress,
  validateSolanaAddress
};
