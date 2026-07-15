require('dotenv').config();
const { Connection, Keypair, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  const secretKey = Buffer.from(process.env.SOL_WALLET_SECRET, 'base64');
  const wallet = Keypair.fromSecretKey(secretKey);
  
  console.log('=== SOLANA DEVNET WALLET ===');
  console.log('Address:', wallet.publicKey.toString());
  console.log('');
  
  // SOL balance
  const solBal = await connection.getBalance(wallet.publicKey);
  console.log(`SOL: ${solBal / LAMPORTS_PER_SOL} SOL`);
  console.log('');
  
  // Check the specific USDC mint you swapped to
  const usdcMint = new PublicKey('USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT');
  const usdcAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
  
  console.log('--- Your Swapped Token ---');
  console.log('Mint:', usdcMint.toString());
  console.log('ATA:', usdcAta.toString());
  
  try {
    const account = await getAccount(connection, usdcAta);
    const balance = Number(account.amount) / 1e6;
    console.log(`Balance: ${balance} USDC`);
  } catch {
    console.log('Balance: 0 (no token account found)');
    console.log('\n⚠️ The swap might have gone to a different wallet.');
    console.log('Did you swap on the hot wallet address below?');
    console.log(wallet.publicKey.toString());
  }
  
  console.log('');
  console.log('View all tokens on explorer:');
  console.log(`https://explorer.solana.com/address/${wallet.publicKey.toString()}?cluster=devnet`);
}

main().catch(console.error);
