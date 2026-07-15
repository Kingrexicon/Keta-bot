require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const rpc = process.env.ETH_RPC_URL || process.env.RPC_URL;
  if (!rpc) {
    console.error('Set ETH_RPC_URL or RPC_URL in your environment.');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const tokenAddress = process.argv[2] || process.env.USDC_CONTRACT_ADDRESS;
  if (!tokenAddress) {
    console.error('Provide token address as first arg or set USDC_CONTRACT_ADDRESS.');
    process.exit(1);
  }

  const abi = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)'
  ];

  const token = new ethers.Contract(tokenAddress, abi, provider);
  const name = await token.name().catch(() => null);
  const symbol = await token.symbol().catch(() => null);
  const decimals = await token.decimals().catch(() => null);

  console.log('Token Address:', tokenAddress);
  console.log('Name:', name || 'N/A');
  console.log('Symbol:', symbol || 'N/A');
  console.log('Decimals:', decimals !== null ? decimals : 'N/A');
}

main().catch(err => { console.error(err); process.exit(1); });
