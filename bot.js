require('dotenv').config();
require('dotenv').config({path: '.env.local', override: true});

const TelegramBot = require('node-telegram-bot-api');
const {PrivyClient} = require('@privy-io/node');
const {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction
} = require('@solana/web3.js');
const {getAllUserWallets, saveUserWallet} = require('./mockDb');
const {
  getJupiterUltraOrder,
  executeJupiterUltraOrder,
  getJupiterUltraBalances,
  SOL_MINT
} = require('./jupiter');

const token = process.env.TELEGRAM_BOT_TOKEN;
const appId = process.env.PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
const authorizationPrivateKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
const solanaRpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
}

if (!appId || !appSecret) {
  throw new Error('Missing PRIVY_APP_ID or PRIVY_APP_SECRET in .env');
}

const bot = new TelegramBot(token, {
  polling: process.env.TELEGRAM_POLLING !== 'false'
});

const privy = new PrivyClient({
  appId,
  appSecret
});
const connection = new Connection(solanaRpcUrl, 'confirmed');

function getAuthorizationContext() {
  if (!authorizationPrivateKey) {
    return undefined;
  }

  return {
    authorization_private_keys: [authorizationPrivateKey]
  };
}

function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

function createSignInput(transaction) {
  const signInput = {
    transaction
  };
  const authorizationContext = getAuthorizationContext();

  if (authorizationContext) {
    signInput.authorization_context = authorizationContext;
  }

  return signInput;
}

async function getOrCreateWallet(userId) {
  const userWallets = getAllUserWallets();

  if (userWallets[userId]) {
    return privy.wallets().get(userWallets[userId]);
  }

  const wallet = await privy.wallets().create({
    chain_type: 'solana',
    external_id: `telegram_${userId}`
  });

  saveUserWallet(userId, wallet.id);
  return wallet;
}

function formatBalances(balances) {
  let message = 'Wallet Balance:\n\n';
  let hasBalance = false;

  for (const [tokenName, balance] of Object.entries(balances || {})) {
    const uiAmount = Number(balance.uiAmount ?? balance.ui_amount ?? 0);
    const rawAmount = String(balance.amount ?? '0');

    if (rawAmount !== '0' && uiAmount > 0) {
      hasBalance = true;
      message += `${tokenName}: ${uiAmount.toFixed(4)}\n`;
    }
  }

  if (!hasBalance) {
    message += 'No tokens found in wallet\n';
  }

  return message;
}

function sendHelp(chatId) {
  return bot.sendMessage(
    chatId,
    'Commands:\n' +
      '/start - Create or view your Solana wallet\n' +
      '/getwallet - View your wallet address and balances\n' +
      '/send <recipient_wallet> <amount> - Send SOL to another wallet\n' +
      '/swap <token_address> <amount> - Swap SOL for another token\n\n' +
      'Example:\n' +
      '/send <recipient_wallet> 0.01\n' +
      '/swap EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.1'
  );
}

bot.onText(/^\/start$/, async (msg) => {
  const userId = msg.from.id;

  try {
    console.log(`Processing /start command for user ${userId}`);
    const wallet = await getOrCreateWallet(userId);

    return bot.sendMessage(
      msg.chat.id,
      'Welcome to the Solana Trading Bot!\n\n' +
        `Your wallet address is: ${wallet.address}\n\n` +
        'Use /getwallet to view balances, /send <recipient_wallet> <amount> to send SOL, or /swap <token_address> <amount> to swap SOL.'
    );
  } catch (error) {
    console.error(`Error processing /start for user ${userId}:`, error);
    return bot.sendMessage(
      msg.chat.id,
      'Sorry, there was an error creating or accessing your wallet. Please try again later.'
    );
  }
});

bot.onText(/^\/help$/, (msg) => {
  return sendHelp(msg.chat.id);
});

bot.onText(/^\/getwallet$/, async (msg) => {
  const userId = msg.from.id;
  const userWallets = getAllUserWallets();

  if (!userWallets[userId]) {
    return bot.sendMessage(msg.chat.id, 'You do not have a wallet yet. Use /start to create one.');
  }

  try {
    console.log(`Processing /getwallet command for user ${userId}`);
    const wallet = await privy.wallets().get(userWallets[userId]);
    const balances = await getJupiterUltraBalances(wallet.address);

    return bot.sendMessage(
      msg.chat.id,
      `Your wallet address is: ${wallet.address}\n\n` +
        formatBalances(balances) +
        '\nUse /send <recipient_wallet> <amount> to send SOL, or /swap <token_address> <amount> to swap SOL.'
    );
  } catch (error) {
    console.error(`Error fetching wallet for user ${userId}:`, error);
    return bot.sendMessage(
      msg.chat.id,
      'Sorry, there was an error accessing your wallet. Please try again later.'
    );
  }
});

bot.onText(/^\/send$/, (msg) => {
  return bot.sendMessage(
    msg.chat.id,
    'Missing parameters.\n\n' +
      'Correct usage:\n' +
      '/send <recipient_wallet> <amount>\n\n' +
      'Example:\n' +
      '/send <recipient_wallet> 0.01'
  );
});

bot.onText(/^\/send\s+(\S+)\s+(\S+)$/, async (msg, match) => {
  const userId = msg.from.id;
  const recipientAddress = match[1];
  const amount = Number(match[2]);
  const userWallets = getAllUserWallets();

  if (!userWallets[userId]) {
    return bot.sendMessage(msg.chat.id, 'Please use /start first to create a wallet.');
  }

  if (!isValidSolanaAddress(recipientAddress)) {
    return bot.sendMessage(
      msg.chat.id,
      'Invalid recipient wallet. Please enter a valid Solana wallet address.\n\n' +
        'Example:\n' +
        '/send <recipient_wallet> 0.01'
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return bot.sendMessage(
      msg.chat.id,
      'Please enter a valid amount of SOL, like 0.01, 0.05, or 1.0.\n\n' +
        'Example:\n' +
        '/send <recipient_wallet> 0.01'
    );
  }

  try {
    console.log(`Processing /send for user ${userId}: ${amount} SOL to ${recipientAddress}`);

    const walletId = userWallets[userId];
    const wallet = await privy.wallets().get(walletId);
    const senderPublicKey = new PublicKey(wallet.address);
    const recipientPublicKey = new PublicKey(recipientAddress);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    const balanceLamports = await connection.getBalance(senderPublicKey, 'confirmed');

    if (balanceLamports < lamports + 5000) {
      return bot.sendMessage(
        msg.chat.id,
        `Insufficient SOL balance.\nYou have ${(balanceLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL but need ${amount} SOL plus network fees.`
      );
    }

    const {blockhash, lastValidBlockHeight} = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      feePayer: senderPublicKey,
      recentBlockhash: blockhash
    }).add(
      SystemProgram.transfer({
        fromPubkey: senderPublicKey,
        toPubkey: recipientPublicKey,
        lamports
      })
    );

    const unsignedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    const signed = await privy.wallets().solana().signTransaction(
      walletId,
      createSignInput(unsignedTransaction)
    );

    await bot.sendMessage(msg.chat.id, 'Transaction signed. Sending SOL...');

    const signature = await connection.sendRawTransaction(
      Buffer.from(signed.signed_transaction, 'base64'),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      }
    );

    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight
      },
      'confirmed'
    );

    return bot.sendMessage(
      msg.chat.id,
      'Send successful!\n\n' +
        `Amount: ${amount} SOL\n` +
        `Recipient: ${recipientAddress}\n` +
        `Transaction: https://solscan.io/tx/${signature}`
    );
  } catch (error) {
    console.error('Error in send flow:', error);
    return bot.sendMessage(
      msg.chat.id,
      'Sorry, there was an error sending SOL. Please check the recipient address, amount, and wallet balance, then try again.'
    );
  }
});

bot.onText(/^\/swap$/, (msg) => {
  return bot.sendMessage(
    msg.chat.id,
    'Missing parameters.\n\n' +
      'Correct usage:\n' +
      '/swap <token_address> <amount>\n\n' +
      'Example:\n' +
      '/swap EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.1'
  );
});

bot.onText(/^\/swap\s+(\S+)\s+(\S+)$/, async (msg, match) => {
  const userId = msg.from.id;
  const tokenMint = match[1];
  const amount = Number(match[2]);
  const userWallets = getAllUserWallets();

  if (!userWallets[userId]) {
    return bot.sendMessage(msg.chat.id, 'Please use /start first to create a wallet.');
  }

  if (!isValidSolanaAddress(tokenMint)) {
    return bot.sendMessage(
      msg.chat.id,
      'Invalid token address. Please enter a valid Solana token address.\n\n' +
        'Example:\n' +
        '/swap EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.1'
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return bot.sendMessage(
      msg.chat.id,
      'Please enter a valid amount of SOL, like 0.1, 0.5, or 1.0.\n\n' +
        'Example:\n' +
        '/swap EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.1'
    );
  }

  try {
    console.log(`Processing /swap for user ${userId}: ${amount} SOL to ${tokenMint}`);

    const walletId = userWallets[userId];
    const wallet = await privy.wallets().get(walletId);
    const balances = await getJupiterUltraBalances(wallet.address);
    const solBalance = Number(balances.SOL?.uiAmount ?? balances.SOL?.ui_amount ?? 0);

    if (solBalance < amount) {
      return bot.sendMessage(
        msg.chat.id,
        `Insufficient SOL balance.\nYou have ${solBalance.toFixed(4)} SOL but need ${amount} SOL.`
      );
    }

    const lamports = Math.floor(amount * 1e9);
    const order = await getJupiterUltraOrder({
      inputMint: SOL_MINT,
      outputMint: tokenMint,
      amount: lamports.toString(),
      taker: wallet.address
    });

    const signed = await privy.wallets().solana().signTransaction(
      walletId,
      createSignInput(order.transaction)
    );

    await bot.sendMessage(msg.chat.id, 'Transaction signed. Processing swap...');

    const executeResult = await executeJupiterUltraOrder(
      signed.signed_transaction,
      order.requestId
    );

    return bot.sendMessage(
      msg.chat.id,
      'Swap successful!\n\n' +
        `Transaction: https://solscan.io/tx/${executeResult.signature}\n` +
        `You swapped ${amount} SOL.\n\n` +
        'Use /getwallet to check your new balance.'
    );
  } catch (error) {
    console.error('Error in swap flow:', error);

    if (error.message?.includes('0x1771')) {
      return bot.sendMessage(
        msg.chat.id,
        'Swap failed due to price movement. Please try again with a smaller amount or wait a moment.'
      );
    }

    if (error.response?.data?.error) {
      return bot.sendMessage(
        msg.chat.id,
        `Error: ${error.response.data.error}\n\nPlease try again with /swap <token_address> <amount>`
      );
    }

    return bot.sendMessage(
      msg.chat.id,
      'Sorry, there was an error processing your swap. Please try again later.'
    );
  }
});

bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error.message);
});

module.exports = bot;
