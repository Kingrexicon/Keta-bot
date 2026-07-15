Here's the testnet-to-mainnet mapping:

| Current (Testnet) | Mainnet Equivalent | Network |
|------------------|-------------------|---------|
| **USDC-BASE-SEPOLIA** | **USDC-BASE** (USDC on Base mainnet) | Base Mainnet |
| **ETH-ERC20** | **ETH** (Native Ether on Ethereum) | Ethereum Mainnet |
| **USDT-ERC20** | **USDT-ERC20** (USDT on Ethereum) | Ethereum Mainnet |

**When you switch to mainnet, you'll need to change:**

1. **RPC URLs** in `.env`:
   - `BASE_SEPOLIA_RPC_URL` → Change to a Base Mainnet RPC (e.g. `https://base-mainnet.g.alchemy.com/v2/...`)
   - `ETH_SEPOLIA_RPC_URL` → Change to an Ethereum Mainnet RPC (e.g. `https://eth-mainnet.g.alchemy.com/v2/...`)

2. **Contract addresses** in `payoutService.js`:
   - `USDC_BASE_SEPOLIA_CONTRACT` → Change to **real USDC on Base**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
   - `USDT_ERC20_SEPOLIA_CONTRACT` → Change to **real USDT on Ethereum**: `0xdAC17F958D2ee523a2206206994597C13D831ec7`

3. **Explorer links** in `notificationService.js`:
   - `sepolia.basescan.org` → `basescan.org`
   - `sepolia.etherscan.io` → `etherscan.io`

4. **Fund your wallet** with real ETH and tokens instead of testnet faucet tokens

But for now you're on testnet which is perfect for testing everything before going live with real money. The code structure supports both — you just update those config values when ready.