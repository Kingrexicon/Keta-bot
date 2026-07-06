/**
 * Payout function — abstracted so the button handler doesn't care which chain it is.
 * Dispatches to the appropriate blockchain-specific payout handler.
 */

const { validateWalletAddress } = require('../utils/validators');
const { releaseSolana, releaseTron } = require('./payoutService');

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

  // Dispatch to the correct payout handler based on chain
  const solanaChains = ['SOL', 'USDT-SOL', 'USDC-SOL'];
  const tronChains = ['TRX', 'USDT-TRC20', 'USDC-TRC20'];

  // NOTE: order has already been set to 'released' status by releaseOrder() before this is called,
  // so the payout handlers will set status to FAILED on error. The caller handles rollback.

  if (solanaChains.includes(order.chain)) {
    return releaseSolana(order, order.releasedBy || 0);
  }

  if (tronChains.includes(order.chain)) {
    return releaseTron(order, order.releasedBy || 0);
  }

  // Fall through to a descriptive error so it's explicit.
  throw new Error(`Payout handler not yet implemented for chain: ${order.chain}`);
}

module.exports = {
  releaseCrypto
};
