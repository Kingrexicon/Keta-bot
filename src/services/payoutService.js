const { ethers } = require('ethers');
const Order = require('../models/Order');
const { validateEVMAddress } = require('../utils/validators');
const { ORDER_STATUS } = require('../utils/constants');

// ──────────────────────────────────────────────
// Token contract addresses
// ──────────────────────────────────────────────

// Base Sepolia USDC contract address
const USDC_BASE_SEPOLIA_CONTRACT = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Ethereum Sepolia USDT contract address
const USDT_ERC20_SEPOLIA_CONTRACT = '0xaa8E23Fb1079EA71e0a56F48a2aA51851D8433D0';

// ──────────────────────────────────────────────
// Provider & Wallet helpers
// ──────────────────────────────────────────────

function getProvider(rpcUrl) {
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getHotWallet(rpcUrl) {
  const privateKey = process.env.EVM_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('EVM_WALLET_PRIVATE_KEY not set in environment');
  }
  const provider = getProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

// ──────────────────────────────────────────────
// Chain configuration
// ──────────────────────────────────────────────

const CHAIN_CONFIG = {
  'USDC-BASE-SEPOLIA': {
    rpcUrl: () => process.env.BASE_SEPOLIA_RPC_URL,
    isNative: false,
    contractAddress: USDC_BASE_SEPOLIA_CONTRACT,
    decimals: 6,
    symbol: 'USDC'
  },
  'ETH-ERC20': {
    rpcUrl: () => process.env.ETH_SEPOLIA_RPC_URL,
    isNative: true,
    contractAddress: null,
    decimals: 18,
    symbol: 'ETH'
  },
  'USDT-ERC20': {
    rpcUrl: () => process.env.ETH_SEPOLIA_RPC_URL,
    isNative: false,
    contractAddress: USDT_ERC20_SEPOLIA_CONTRACT,
    decimals: 6,
    symbol: 'USDT'
  }
};

// ──────────────────────────────────────────────
// Balance check helpers
// ──────────────────────────────────────────────

/**
 * Check native coin (ETH) balance
 */
async function checkNativeBalance(walletAddress, rpcUrl) {
  const provider = getProvider(rpcUrl);
  const balance = await provider.getBalance(walletAddress);
  return ethers.formatEther(balance);
}

/**
 * Check ERC-20 token balance
 */
async function checkTokenBalance(walletAddress, contractAddress, rpcUrl) {
  const provider = getProvider(rpcUrl);
  const erc20Abi = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
  ];
  const contract = new ethers.Contract(contractAddress, erc20Abi, provider);
  const decimals = await contract.decimals();
  const balance = await contract.balanceOf(walletAddress);
  return ethers.formatUnits(balance, decimals);
}

// ──────────────────────────────────────────────
// Transfer helpers
// ──────────────────────────────────────────────

/**
 * Transfer native ETH
 */
async function transferNative(wallet, toAddress, amount) {
  const tx = await wallet.sendTransaction({
    to: toAddress,
    value: ethers.parseEther(amount.toString())
  });
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Transfer ERC-20 token
 */
async function transferToken(wallet, toAddress, contractAddress, amount, decimals) {
  const erc20Abi = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)'
  ];
  const contract = new ethers.Contract(contractAddress, erc20Abi, wallet);
  const amountInDecimals = ethers.parseUnits(amount.toString(), decimals);
  const tx = await contract.transfer(toAddress, amountInDecimals);
  const receipt = await tx.wait();
  return receipt.hash;
}

// ──────────────────────────────────────────────
// Main payout handler
// ──────────────────────────────────────────────

/**
 * releaseEVM(order, adminId)
 * Handles native ETH and ERC-20 token transfers for all EVM chains.
 *
 * Steps:
 *  1. Validate receiving address
 *  2. Check balance (ETH for gas + token for token transfers)
 *  3. Execute transfer
 *  4. Update order with tx hash
 *  5. Log payout attempt
 *
 * Returns { success, txHash, error }
 */
async function releaseEVM(order, adminId) {
  const { orderRef, walletAddress, chain, cryptoAmount } = order;

  try {
    // 1. Validate address
    if (!validateEVMAddress(walletAddress)) {
      throw new Error(`Invalid EVM address: ${walletAddress}`);
    }

    const config = CHAIN_CONFIG[chain];
    if (!config) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    const rpcUrl = config.rpcUrl();
    if (!rpcUrl) {
      throw new Error(`RPC URL not configured for chain: ${chain}`);
    }

    const wallet = getHotWallet(rpcUrl);

    // 2. Check hot wallet ETH balance (needed for gas on any EVM chain)
    const ethBalance = await checkNativeBalance(wallet.address, rpcUrl);
    if (parseFloat(ethBalance) < 0.001) {
      throw new Error(`Insufficient ETH balance for gas: ${ethBalance} ETH`);
    }

    let txHash;

    if (config.isNative) {
      // Native ETH transfer
      const ethBalanceNum = parseFloat(ethBalance);
      if (ethBalanceNum < parseFloat(cryptoAmount) + 0.0005) {
        throw new Error(`Insufficient ETH balance: ${ethBalance} ETH, need ${parseFloat(cryptoAmount) + 0.0005}`);
      }
      txHash = await transferNative(wallet, walletAddress, cryptoAmount);
    } else {
      // ERC-20 token transfer
      const tokenBalance = await checkTokenBalance(wallet.address, config.contractAddress, rpcUrl);
      if (parseFloat(tokenBalance) < parseFloat(cryptoAmount)) {
        throw new Error(`Insufficient ${config.symbol} balance: ${tokenBalance} ${config.symbol}, need ${cryptoAmount}`);
      }
      txHash = await transferToken(wallet, walletAddress, config.contractAddress, cryptoAmount, config.decimals);
    }

    // 4. Update order
    await Order.findOneAndUpdate(
      { orderRef },
      { $set: { txHash, status: ORDER_STATUS.RELEASED, releasedBy: adminId, releasedAt: new Date() } }
    );

    return { success: true, txHash, error: null };
  } catch (err) {
    // Mark order as failed so admin can retry
    await Order.findOneAndUpdate(
      { orderRef },
      { $set: { status: ORDER_STATUS.FAILED, payoutError: err.message } }
    );
    return { success: false, txHash: null, error: err.message };
  }
}

module.exports = {
  releaseEVM,
  // Exported for testing
  checkNativeBalance,
  checkTokenBalance,
  transferNative,
  transferToken
};