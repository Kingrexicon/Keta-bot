const { ethers } = require('ethers');

// Generate a random EVM wallet
const wallet = ethers.Wallet.createRandom();

console.log('=== NEW EVM WALLET GENERATED ===');
console.log('');
console.log('Wallet Address:  ' + wallet.address);
console.log('Private Key:     ' + wallet.privateKey);
console.log('');
console.log('⚠️  SAVE YOUR PRIVATE KEY SOMEWHERE SAFE!');
console.log('   Never share it with anyone.');
console.log('   This is the key you put in EVM_WALLET_PRIVATE_KEY in .env');
console.log('');
console.log('📌 Next steps:');
console.log('   1. Copy the Private Key above into your .env file as EVM_WALLET_PRIVATE_KEY');
console.log('   2. Fund this wallet with test ETH on Base Sepolia and Ethereum Sepolia');
console.log('   3. Fund it with test USDC (Base Sepolia) and test USDT (Ethereum Sepolia)');