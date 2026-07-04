const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, clusterApiUrl } = require('@solana/web3.js');
require('dotenv').config();

async function testSend() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  // Load your hot wallet from the secret key you saved
  const secretKey = Buffer.from(process.env.SOL_WALLET_SECRET, 'base64');
  const fromWallet = Keypair.fromSecretKey(secretKey);

  // Generate a new devnet wallet to act as the "client" receiving address
  const toWallet = Keypair.generate();
  const toPublicKey = toWallet.publicKey;

  console.log('=== SOL Devnet Test Transfer ===');
  console.log('From (Hot Wallet):', fromWallet.publicKey.toBase58());
  console.log('To (New Test Wallet):', toPublicKey.toBase58());
  console.log('New Wallet Secret Key (base64):', Buffer.from(toWallet.secretKey).toString('base64'));
  console.log('Amount: 0.01 SOL');
  console.log('');

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromWallet.publicKey,
      toPubkey: toPublicKey,
      lamports: 0.01 * 1e9, // sending 0.01 SOL as a test
    })
  );

  console.log('Sending transaction...');
  const signature = await sendAndConfirmTransaction(connection, transaction, [fromWallet]);
  console.log('');
  console.log('✅ Transaction confirmed!');
  console.log('Signature:', signature);
  console.log('');
  console.log('View on Solana Explorer:');
  console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  console.log(`https://explorer.solana.com/address/${toPublicKey.toBase58()}?cluster=devnet`);
}

testSend().catch(err => {
  console.error('❌ Transaction failed:', err);
  process.exit(1);
});