/**
 * Payout function — abstracted so the button handler doesn't care which chain it is.
 * This is a placeholder integration point. Replace with actual wallet/API calls.
 */

const { validateWalletAddress } = require('../utils/validators');

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

  // --- TODO: Implement actual crypto transfer ---
  // switch (order.chain) {
  //   case 'BTC':
  //     // Use bitcoinjs-lib or exchange withdrawal API
  //     break;
  //   case 'ETH':
  //     // Use ethers.js
  //     break;
  //   case 'USDT-TRC20':
  //   case 'USDC-TRC20':
  //     // Use TronWeb
  //     break;
  //   case 'USDT-BEP20':
  //   case 'USDC-BEP20':
  //     // Use ethers.js with BSC RPC
  //     break;
  //   default:
  //     throw new Error(`Unsupported chain: ${order.chain}`);
  // }

  // Simulate a successful payout for now — replace with real implementation
  console.log(`[PAYOUT] Would send ${order.cryptoAmount} ${order.chain} to ${order.walletAddress}`);

  // Simulated tx hash
  const simulatedTxHash = `SIM_TX_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  return { success: true, txHash: simulatedTxHash };
}

module.exports = {
  releaseCrypto
};