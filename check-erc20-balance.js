require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const rpc = process.env.ETH_RPC_URL || process.env.RPC_URL;
  if (!rpc) {
    console.error('Set ETH_RPC_URL or RPC_URL in your environment.');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const address = process.argv[2] || process.env.ETH_WALLET_ADDRESS;
  if (!address) {
    console.error('Provide an address as the first arg or set ETH_WALLET_ADDRESS.');
    process.exit(1);
  }

  const tokenAddress = process.env.USDC_CONTRACT_ADDRESS || process.argv[3];
  if (!tokenAddress) {
    console.error('Set USDC_CONTRACT_ADDRESS or pass token address as second arg.');
    process.exit(1);
  }

  const abi = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ];

  const token = new ethers.Contract(tokenAddress, abi, provider);
  const raw = await token.balanceOf(address);
  const decimals = await token.decimals();
  const balance = ethers.formatUnits(raw, decimals);

  console.log('Address:', address);
  console.log('Token:', tokenAddress);
  console.log('Balance:', balance);
}

main().catch(err => { console.error(err); process.exit(1); });
