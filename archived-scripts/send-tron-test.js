const { TronWeb } = require('tronweb');
require('dotenv').config();

async function sendTestTrx() {
  const tronWeb = new TronWeb({
    fullHost: process.env.TRON_RPC_URL,
    headers: { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY },
  });

  // Load sender wallet from private key in .env
  const senderPrivateKey = process.env.TRON_WALLET_PRIVATE_KEY;
  tronWeb.setPrivateKey(senderPrivateKey);
  const fromAddress = tronWeb.address.fromPrivateKey(senderPrivateKey);

  // Generate a new receiving wallet
  const toWallet = await tronWeb.createAccount();
  const toAddress = toWallet.address.base58;

  console.log('=== TRON (Shasta Testnet) Transfer ===');
  console.log('From:', fromAddress);
  console.log('To:', toAddress);
  console.log('New Wallet Private Key:', toWallet.privateKey);
  console.log('Amount: 10 TRX');
  console.log('');

  // Send 10 TRX (10 * 1_000_000 sun)
  const amountInSun = 10 * 1_000_000;

  const tx = await tronWeb.trx.sendTransaction(toAddress, amountInSun, senderPrivateKey);

  console.log('✅ Transaction sent!');
  console.log('TxID:', tx.txid || tx.transaction?.txID);
  console.log('');
  console.log('View on Tronscan (Shasta):');
  console.log(`https://shasta.tronscan.org/#/transaction/${tx.txid || tx.transaction?.txID}`);
  console.log(`https://shasta.tronscan.org/#/address/${toAddress}`);
}

sendTestTrx().catch(err => {
  console.error('❌ Transaction failed:', err);
  process.exit(1);
});
