const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, clusterApiUrl, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, getAccount } = require('@solana/spl-token');
const { TronWeb } = require('tronweb');
const Order = require('../models/Order');
const { validateSOLAddress, validateTRC20Address } = require('../utils/validators');
const { ORDER_STATUS } = require('../utils/constants');

// ──────────────────────────────────────────────
// Solana USDC mint address on devnet
// ──────────────────────────────────────────────
const USDC_MINT_DEVNET = new PublicKey('USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT');

// ──────────────────────────────────────────────
// TRC20 USDT contract address on Shasta testnet
// ──────────────────────────────────────────────
const USDT_TRC20_SHASTA = 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj';

// ──────────────────────────────────────────────
// Solana helpers
// ──────────────────────────────────────────────
let solConnection;

function getSolRpcUrl() {
  return process.env.SOL_RPC_URL?.trim() || clusterApiUrl('devnet');
}

function isSolanaRateLimitError(err) {
  if (!err) return false;
  const message = String(err.message || err).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('rate limit') ||
    message.includes('connection rate limits exceeded')
  );
}

async function retryRpcOperation(fn, retries = 3, baseDelayMs = 500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries || !isSolanaRateLimitError(err)) {
        throw err;
      }
      const delayMs = baseDelayMs * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function getSolConnection() {
  if (solConnection) {
    return solConnection;
  }

  solConnection = new Connection(getSolRpcUrl(), 'confirmed');
  return solConnection;
}

function getHotWallet() {
  const secretKey = Buffer.from(process.env.SOL_WALLET_SECRET, 'base64');
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Check SOL balance of a wallet address
 */
async function checkSolBalance(publicKey) {
  const connection = getSolConnection();
  const balance = await retryRpcOperation(() => connection.getBalance(publicKey));
  return balance / LAMPORTS_PER_SOL;
}

/**
 * Check SPL token (USDC) balance of an associated token account
 */
async function checkSplTokenBalance(walletPublicKey, mintPublicKey) {
  const connection = getSolConnection();
  const ata = await getAssociatedTokenAddress(mintPublicKey, walletPublicKey);
  try {
    const account = await retryRpcOperation(() => getAccount(connection, ata));
    return Number(account.amount) / 1e6; // USDC has 6 decimals
  } catch {
    return 0; // token account doesn't exist yet
  }
}

/**
 * Transfer native SOL
 */
async function transferSol(fromWallet, toPublicKey, amountSol) {
  const connection = getSolConnection();
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromWallet.publicKey,
      toPubkey: toPublicKey,
      lamports,
    })
  );

  const signature = await retryRpcOperation(() => sendAndConfirmTransaction(connection, transaction, [fromWallet]));
  return signature;
}

/**
 * Transfer SPL token (USDC) — creates ATA if needed
 */
async function transferSplToken(fromWallet, toPublicKey, mintPublicKey, amount) {
  const connection = getSolConnection();
  const fromAta = await getAssociatedTokenAddress(mintPublicKey, fromWallet.publicKey);
  const toAta = await getAssociatedTokenAddress(mintPublicKey, toPublicKey);

  const transaction = new Transaction();

  // Check if recipient ATA exists; if not, add instruction to create it
  try {
    await getAccount(connection, toAta);
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        fromWallet.publicKey,
        toAta,
        toPublicKey,
        mintPublicKey
      )
    );
  }

  // Amount in USDC has 6 decimals
  const amountInDecimals = Math.floor(amount * 1e6);

  transaction.add(
    createTransferInstruction(
      fromAta,
      toAta,
      fromWallet.publicKey,
      BigInt(amountInDecimals)
    )
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [fromWallet]);
  return signature;
}

// ──────────────────────────────────────────────
// Tron helpers
// ──────────────────────────────────────────────
function getTronWeb() {
  return new TronWeb({
    fullHost: process.env.TRON_RPC_URL,
    headers: { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY },
  });
}

/**
 * Check TRX balance
 */
async function checkTrxBalance(address) {
  const tronWeb = getTronWeb();
  const balance = await tronWeb.trx.getBalance(address);
  return tronWeb.fromSun(balance);
}

/**
 * Check TRC20 (USDT) token balance
 */
async function checkTrc20Balance(address, contractAddress) {
  const tronWeb = getTronWeb();
  const contract = await tronWeb.contract().at(contractAddress);
  const balance = await contract.balanceOf(address).call();
  return tronWeb.fromSun(balance);
}

/**
 * Transfer native TRX
 */
async function transferTrx(fromPrivateKey, toAddress, amountTrx) {
  const tronWeb = getTronWeb();
  tronWeb.setPrivateKey(fromPrivateKey);
  const amountInSun = Math.floor(amountTrx * 1_000_000);
  const tx = await tronWeb.trx.sendTransaction(toAddress, amountInSun, fromPrivateKey);
  return tx.txid || tx.transaction?.txID;
}

/**
 * Transfer TRC20 (USDT) token
 */
async function transferTrc20(fromPrivateKey, toAddress, contractAddress, amount) {
  const tronWeb = getTronWeb();
  tronWeb.setPrivateKey(fromPrivateKey);
  const contract = await tronWeb.contract().at(contractAddress);
  const amountInSun = Math.floor(amount * 1_000_000); // USDT has 6 decimals
  const tx = await contract.transfer(toAddress, amountInSun).send({
    feeLimit: 50_000_000, // 50 TRX fee limit
    callValue: 0,
    shouldPollResponse: true,
  });
  return tx;
}

// ──────────────────────────────────────────────
// Main payout handlers
// ──────────────────────────────────────────────

/**
 * releaseSolana(order, adminId)
 * Handles native SOL and SPL token (USDC-SOL) transfers.
 *
 * Steps:
 *  1. Validate receiving address
 *  2. Check balance (SOL for gas + USDC for token transfers)
 *  3. Execute transfer
 *  4. Update order with tx hash
 *  5. Log payout attempt
 *
 * Returns { success, txHash, error }
 */
async function releaseSolana(order, adminId) {
  const { orderRef, walletAddress, chain, cryptoAmount } = order;

  try {
    // 1. Validate address
    if (!validateSOLAddress(walletAddress)) {
      throw new Error(`Invalid Solana address: ${walletAddress}`);
    }

    const toPublicKey = new PublicKey(walletAddress);
    const fromWallet = getHotWallet();

    // 2. Check hot wallet SOL balance (needed for gas)
    const solBalance = await checkSolBalance(fromWallet.publicKey);
    if (solBalance < 0.01) {
      throw new Error(`Insufficient SOL balance for gas: ${solBalance} SOL`);
    }

    let txHash;

    if (chain === 'SOL') {
      // Native SOL transfer
      // Check balance
      if (solBalance < cryptoAmount + 0.005) {
        throw new Error(`Insufficient SOL balance: ${solBalance} SOL, need ${cryptoAmount + 0.005}`);
      }
      txHash = await transferSol(fromWallet, toPublicKey, cryptoAmount);
    } else if (chain === 'USDC-SOL') {
      // SPL USDC transfer
      const usdcBalance = await checkSplTokenBalance(fromWallet.publicKey, USDC_MINT_DEVNET);
      if (usdcBalance < cryptoAmount) {
        throw new Error(`Insufficient USDC balance: ${usdcBalance} USDC, need ${cryptoAmount}`);
      }
      txHash = await transferSplToken(fromWallet, toPublicKey, USDC_MINT_DEVNET, cryptoAmount);
    } else {
      throw new Error(`Unsupported Solana chain: ${chain}`);
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

/**
 * releaseTron(order, adminId)
 * Handles native TRX and TRC20 token (USDT-TRC20) transfers.
 *
 * Steps:
 *  1. Validate receiving address
 *  2. Check balance
 *  3. Execute transfer
 *  4. Update order with tx hash
 *  5. Log payout attempt
 *
 * Returns { success, txHash, error }
 */
async function releaseTron(order, adminId) {
  const { orderRef, walletAddress, chain, cryptoAmount } = order;

  try {
    // 1. Validate address
    if (!validateTRC20Address(walletAddress)) {
      throw new Error(`Invalid Tron address: ${walletAddress}`);
    }

    const tronWeb = getTronWeb();
    const fromAddress = tronWeb.address.fromPrivateKey(process.env.TRON_WALLET_PRIVATE_KEY);
    const fromPrivateKey = process.env.TRON_WALLET_PRIVATE_KEY;

    // 2. Check TRX balance (needed for gas)
    const trxBalance = await checkTrxBalance(fromAddress);
    if (trxBalance < 5) {
      throw new Error(`Insufficient TRX for gas: ${trxBalance} TRX`);
    }

    let txHash;

    if (chain === 'TRX') {
      // Native TRX transfer
      if (trxBalance < cryptoAmount + 1) {
        throw new Error(`Insufficient TRX balance: ${trxBalance} TRX, need ${cryptoAmount + 1}`);
      }
      txHash = await transferTrx(fromPrivateKey, walletAddress, cryptoAmount);
    } else if (chain === 'USDT-TRC20' || chain === 'USDC-TRC20') {
      // TRC20 token transfer
      const contractAddress = USDT_TRC20_SHASTA;
      const tokenBalance = await checkTrc20Balance(fromAddress, contractAddress);
      if (tokenBalance < cryptoAmount) {
        throw new Error(`Insufficient token balance: ${tokenBalance}, need ${cryptoAmount}`);
      }
      txHash = await transferTrc20(fromPrivateKey, walletAddress, contractAddress, cryptoAmount);
    } else {
      throw new Error(`Unsupported Tron chain: ${chain}`);
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
  releaseSolana,
  releaseTron,
  // Exported for testing
  checkSolBalance,
  checkSplTokenBalance,
  checkTrxBalance,
  checkTrc20Balance,
  transferSol,
  transferSplToken,
  transferTrx,
  transferTrc20,
};