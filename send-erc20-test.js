require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const rpc = process.env.ETH_RPC_URL || process.env.RPC_URL;
  if (!rpc) {
    console.error('Set ETH_RPC_URL or RPC_URL in your environment.');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const senderPrivateKey = process.env.ETH_WALLET_PRIVATE_KEY;
  if (!senderPrivateKey) {
    console.error('Set ETH_WALLET_PRIVATE_KEY in your environment.');
    process.exit(1);
  }

  const wallet = new ethers.Wallet(senderPrivateKey, provider);
  const tokenAddress = process.env.USDC_CONTRACT_ADDRESS;
  if (!tokenAddress) {
    console.error('Set USDC_CONTRACT_ADDRESS in your environment.');
    process.exit(1);
  }

  const recipientArg = process.argv[2];
  let recipient = recipientArg;
  if (!recipient) {
    const random = ethers.Wallet.createRandom();
    console.log('No recipient provided — generated test wallet:');
    console.log('Address:', random.address);
    console.log('PrivateKey:', random.privateKey);
    recipient = random.address;
    console.log('NOTE: This recipient likely has no ETH to receive tokens; fund it or provide a real address.');
  }

  const amount = process.argv[3] || process.env.SEND_AMOUNT || '0.1';

  const erc20Abi = [
    'function decimals() view returns (uint8)',
    'function transfer(address,uint256) returns (bool)'
  ];

  const token = new ethers.Contract(tokenAddress, erc20Abi, wallet);
  const decimals = await token.decimals();
  const rawAmount = ethers.parseUnits(amount, decimals);

  console.log(`Sending ${amount} tokens (${rawAmount.toString()}) to ${recipient}`);

  const tx = await token.transfer(recipient, rawAmount);
  console.log('Transaction submitted:', tx.hash);
  await tx.wait();
  console.log('Transaction confirmed:', tx.hash);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
