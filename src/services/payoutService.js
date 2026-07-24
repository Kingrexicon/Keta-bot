const { ethers } = require('ethers');
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, createTransferInstruction, getMint, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const Order = require('../models/Order');
const { validateEVMAddress, validateSolanaAddress } = require('../utils/validators');
const { ORDER_STATUS } = require('../utils/constants');

// ──────────────────────────────────────────────
// Token contract addresses (Mainnet)
// ──────────────────────────────────────────────

// Base Mainnet USDC contract address
const USDC_BASE_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Ethereum Mainnet USDT contract address
const USDT_ERC20_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

// Solana Mainnet USDT SPL Mint address
const USDT_SOL_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

// ──────────────────────────────────────────────
// Provider & Wallet helpers — EVM
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
// Provider & Wallet helpers — Solana
// ──────────────────────────────────────────────

function getSolanaConnection(rpcUrl) {
  if (!rpcUrl) {
    throw new Error('Solana RPC URL not configured');
  }
  return new Connection(rpcUrl, 'confirmed');
}

function getSolanaWallet() {
  const secretKeyBase64 = process.env.SOL_WALLET_SECRET;
  if (!secretKeyBase64) {
    throw new Error('SOL_WALLET_SECRET not set in environment');
  }
  const rawKey = Buffer.from(secretKeyBase64, 'base64');

  // Support both formats:
  // 1) Standard 64-byte secret key
  // 2) Extended format (e.g. 66 bytes) — use first 32 bytes as seed
  if (rawKey.length === 64) {
    return Keypair.fromSecretKey(rawKey);
  }

  if (rawKey.length >= 32) {
    const seed = rawKey.slice(0, 32);
    return Keypair.fromSeed(seed);
  }

  throw new Error(`Invalid SOL_WALLET_SECRET length: ${rawKey.length} bytes (expected 64+)`);
}

// ──────────────────────────────────────────────
// Chain configuration
// ──────────────────────────────────────────────

const CHAIN_CONFIG = {
  'USDC-BASE': {
    rpcUrl: () => process.env.BASE_MAINNET_RPC_URL,
    isNative: false,
    contractAddress: USDC_BASE_CONTRACT,
    decimals: 6,
    symbol: 'USDC',
    isSolana: false
  },
  'ETH-ERC20': {
    rpcUrl: () => process.env.ETH_MAINNET_RPC_URL,
    isNative: true,
    contractAddress: null,
    decimals: 18,
    symbol: 'ETH',
    isSolana: false
  },
  'USDT-ERC20': {
    rpcUrl: () => process.env.ETH_MAINNET_RPC_URL,
    isNative: false,
    contractAddress: USDT_ERC20_CONTRACT,
    decimals: 6,
    symbol: 'USDT',
    isSolana: false
  },
  'USDT-SOL': {
    rpcUrl: () => process.env.SOLANA_RPC_URL,
    isNative: false,
    contractAddress: null,
    mintAddress: USDT_SOL_MINT,
    decimals: 6,
    symbol: 'USDT',
    isSolana: true
  }
};

// ──────────────────────────────────────────────
// Balance check helpers — EVM
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
// Balance check helpers — Solana
// ──────────────────────────────────────────────

/**
 * Check SOL balance (for gas)
 */
async function checkSolanaNativeBalance(walletPublicKey, connection) {
  const balance = await connection.getBalance(walletPublicKey);
  return balance / LAMPORTS_PER_SOL;
}

/**
 * Check SPL token balance (USDT-SOL)
 */
async function checkSolanaTokenBalance(walletPublicKey, mintAddress, connection) {
  const mintPubkey = new PublicKey(mintAddress);
  const ata = await getAssociatedTokenAddress(mintPubkey, walletPublicKey);

  try {
    const account = await getAccount(connection, ata);
    const mintInfo = await getMint(connection, mintPubkey);
    return Number(account.amount) / Math.pow(10, mintInfo.decimals);
  } catch (err) {
    // No token account yet = 0 balance
    return 0;
  }
}

// ──────────────────────────────────────────────
// Transfer helpers — EVM
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
// Transfer helpers — Solana
// ──────────────────────────────────────────────

/**
 * Transfer SPL token (USDT-SOL)
 */
async function transferSplToken(wallet, toAddress, mintAddress, amount, decimals) {
  const connection = getSolanaConnection(CHAIN_CONFIG['USDT-SOL'].rpcUrl());
  const mintPubkey = new PublicKey(mintAddress);
  const toPubkey = new PublicKey(toAddress);

  // Get sender's ATA
  const senderAta = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);

  // Ensure sender ATA exists
  try {
    await getAccount(connection, senderAta);
  } catch (err) {
    throw new Error(`Sender token account does not exist for USDT-SOL: ${senderAta.toString()}`);
  }

  // Get recipient ATA address
  const recipientAta = await getAssociatedTokenAddress(mintPubkey, toPubkey);

  const amountInSmallestUnit = Math.floor(amount * Math.pow(10, decimals));

  // Build and send transaction
  const { Transaction } = require('@solana/web3.js');
  const transaction = new Transaction();

  // Check if recipient ATA exists; if not, add instruction to create it
  try {
    await getAccount(connection, recipientAta);
  } catch (err) {
    // Recipient ATA doesn't exist — add create instruction (hot wallet pays rent)
    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        recipientAta,
        toPubkey,
        mintPubkey
      )
    );
  }

  // Build transfer instruction
  const transferIx = createTransferInstruction(
    senderAta,
    recipientAta,
    wallet.publicKey,
    amountInSmallestUnit
  );
  transaction.add(transferIx);

  // Fetch a fresh recent blockhash to avoid "block height exceeded" errors
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const signature = await require('@solana/web3.js').sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet]
  );

  return signature;
}

// ──────────────────────────────────────────────
// EVM payout handler
// ──────────────────────────────────────────────

/**
 * releaseEVM(order, adminId)
 * Handles native ETH and ERC-20 token transfers for all EVM chains.
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

    // 3. Update order
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

// ──────────────────────────────────────────────
// Solana payout handler
// ──────────────────────────────────────────────

/**
 * releaseSolana(order, adminId)
 * Handles USDT-SPL token transfers on Solana mainnet.
 */
async function releaseSolana(order, adminId) {
  const { orderRef, walletAddress, chain, cryptoAmount } = order;

  try {
    // 1. Validate address
    if (!validateSolanaAddress(walletAddress)) {
      throw new Error(`Invalid Solana address: ${walletAddress}`);
    }

    const config = CHAIN_CONFIG[chain];
    if (!config || !config.isSolana) {
      throw new Error(`Unsupported Solana chain: ${chain}`);
    }

    const rpcUrl = config.rpcUrl();
    const connection = getSolanaConnection(rpcUrl);
    const wallet = getSolanaWallet();

    // 2. Check SOL balance (gas)
    const solBalance = await checkSolanaNativeBalance(wallet.publicKey, connection);
    if (solBalance < 0.01) {
      throw new Error(`Insufficient SOL for gas: ${solBalance} SOL, need at least 0.01 SOL`);
    }

    // 3. Check USDT-SOL token balance
    const tokenBalance = await checkSolanaTokenBalance(wallet.publicKey, config.mintAddress, connection);
    if (tokenBalance < parseFloat(cryptoAmount)) {
      throw new Error(`Insufficient USDT balance: ${tokenBalance} USDT, need ${cryptoAmount}`);
    }

    // 4. Transfer
    const txHash = await transferSplToken(wallet, walletAddress, config.mintAddress, cryptoAmount, config.decimals);

    // 5. Update order
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

// ──────────────────────────────────────────────
// Main payout dispatcher
// ──────────────────────────────────────────────

/**
 * releaseCrypto(order, adminId)
 * Dispatches to the appropriate chain-specific payout handler.
 */
async function releaseCrypto(order, adminId) {
  // Defense in depth: re-validate wallet address immediately before sending
  if (!order.walletAddress) {
    throw new Error('Wallet address is empty');
  }

  const chain = order.chain;
  const config = CHAIN_CONFIG[chain];

  if (!config) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  if (config.isSolana) {
    return releaseSolana(order, adminId);
  }

  return releaseEVM(order, adminId);
}

module.exports = {
  releaseCrypto,
  releaseEVM,
  releaseSolana,
  // Exported for testing
  checkNativeBalance,
  checkTokenBalance,
  checkSolanaNativeBalance,
  checkSolanaTokenBalance,
  transferNative,
  transferToken,
  transferSplToken,
  // Exported for admin balance checks
  getSolanaConnection,
  getSolanaWallet
};
