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

/**
 * Validate a person's name (surname, first name, or other names).
 * Allows letters (including accented), spaces, hyphens, apostrophes, and periods.
 * Length: 2-100 characters.
 */
function validateName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  return /^[\p{L}][\p{L}\s.'’-]*$/u.test(trimmed);
}

/**
 * Validate a phone number in common formats:
 *   +2348012345678
 *   2348012345678
 *   08012345678
 * Generic international: 8-15 digits, optional leading +
 */
function validatePhoneNumber(phone) {
  if (typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  return /^\+?\d{8,15}$/.test(trimmed);
}

/**
 * Normalize a phone number for storage/API submission.
 * Strips the leading '+' (Anchor rejects numbers with '+'), plus any
 * spaces, dashes, or parentheses. Keeps the remaining digits as-is.
 * Examples:
 *   +2348012345678  -> 2348012345678
 *   +234 801 234 5678 -> 2348012345678
 *   09066551893     -> 09066551893
 */
function normalizePhoneNumber(phone) {
  if (typeof phone !== 'string') return phone;
  return phone.replace(/[+\s\-()]/g, '');
}

module.exports = {
  generateOrderRef,
  validateWalletAddress,
  validateEVMAddress,
  validateSolanaAddress,
  validateName,
  validatePhoneNumber,
  normalizePhoneNumber
};
