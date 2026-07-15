require('dotenv').config();
const { Connection, Keypair, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const https = require('https');

const USDC_MINT = new PublicKey('USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT');

function fetchUrl(url, postData = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: postData ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    if (postData) {
      const body = JSON.stringify(postData);
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  const secretKey = Buffer.from(process.env.SOL_WALLET_SECRET, 'base64');
  const wallet = Keypair.fromSecretKey(secretKey);
  
  console.log('=== Solana Devnet Wallet ===');
  console.log('Address:', wallet.publicKey.toString());
  console.log('USDC ATA:', (await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey)).toString());
  
  // Check current USDC balance
  const ata = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
  try {
    const account = await getAccount(connection, ata);
    const bal = Number(account.amount) / 1e6;
    console.log('Current USDC balance:', bal);
    if (bal > 0) {
      console.log('✅ You already have USDC!');
      return;
    }
  } catch {
    console.log('No USDC balance yet.');
  }
  
  console.log('\n--- Option 1: Try Solana Faucet API ---');
  try {
    const result = await fetchUrl(`https://api.devnet.solana.com/faucet?address=${wallet.publicKey.toString()}`);
    console.log('SOL faucet result:', result.substring(0, 200));
  } catch (e) {
    console.log('SOL faucet error:', e.message);
  }
  
  console.log('\n--- Option 2: Try JSFaucet API ---');
  try {
    const result = await fetchUrl('https://jsf.vercel.app/api/faucet', {
      wallet: wallet.publicKey.toString(),
      token: 'USDC'
    });
    console.log('JSFaucet result:', result.substring(0, 200));
  } catch (e) {
    console.log('JSFaucet error:', e.message);
  }
  
  console.log('\n========================================');
  console.log('✅ ATA is already created!');
  console.log('Your USDC ATA address:', ata.toString());
  console.log('\nTo get devnet USDC, visit one of these in your browser:');
  console.log('1. https://spl-token-faucet.com - paste your wallet address, select USDC');
  console.log('2. https://jsf.vercel.app/ - connect wallet or paste address');
  console.log('3. https://faucet.solana.com - get SOL first, then swap on a devnet DEX');
  console.log('\nYour wallet address: ' + wallet.publicKey.toString());
}

main().catch(console.error);
