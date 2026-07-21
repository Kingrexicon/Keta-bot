/**
 * Payout function — abstracted so the button handler doesn't care which chain it is.
 * Dispatches to the appropriate blockchain-specific payout handler.
 */

const { validateWalletAddress } = require('../utils/validators');
const { releaseCrypto: releaseCryptoPayout } = require('./payoutService');

/**
 * Release crypto to the user's wallet.
 * @param {Object} order - The order document (must be in 'released' status by now)
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
async function releaseCrypto(order) {
  // Defense in depth: re-validate wallet address immediately before sending
  if (!order.walletAddress) {
    throw new Error('Wallet address is empty');
  }

  const isValid = validateWalletAddress(order.walletAddress, order.chain);
  if (!isValid) {
    throw new Error(`Invalid wallet address for chain ${order.chain}: ${order.walletAddress}`);
  }

  // Dispatch to chain-specific payout handler (EVM or Solana)
  return releaseCryptoPayout(order, order.releasedBy || 0);
}

module.exports = {
  releaseCrypto
};