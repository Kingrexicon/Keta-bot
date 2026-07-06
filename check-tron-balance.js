const { TronWeb } = require('tronweb');
require('dotenv').config();

async function checkBalance() {
  const tronWeb = new TronWeb({
    fullHost: process.env.TRON_RPC_URL,
    headers: { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY },
  });

  const privateKey = process.env.TRON_WALLET_PRIVATE_KEY;
  const address = tronWeb.address.fromPrivateKey(privateKey);

  console.log('=== TRON (Shasta Testnet) Balance Check ===');
  console.log('Wallet Address:', address);
  console.log('');

  const balance = await tronWeb.trx.getBalance(address);
  const balanceInTRX = tronWeb.fromSun(balance);

  console.log(`Balance: ${balanceInTRX} TRX (${balance} sun)`);
}

checkBalance().catch(err => {
  console.error('❌ Failed to check balance:', err);
  process.exit(1);
});