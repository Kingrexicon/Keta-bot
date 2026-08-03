# KetaBot — Crypto Broker Telegram Bot

KetaBot is a Telegram-based crypto broker that lets users buy USDT, ETH, and USDC across multiple chains. Buyers send Naira to a bank account, an admin verifies the payment, and the bot releases crypto to the buyer’s wallet.

---

## Supported Chains

       - **USDT-ERC20** — Ethereum mainnet
       - **USDT-SOL** — Solana mainnet (SPL token)
       - **ETH-ERC20** — Ethereum mainnet (native ETH)
       - **USDC-BASE** — Base mainnet (USDC)

       Chains are configured in `src/services/payoutService.js` via `CHAIN_CONFIG`. Each chain has its own RPC endpoint, contract/mint address, and decimals.

       ---

## How It Works

       ```
       User opens bot → /start
              ↓
       Select coin (USDT / ETH / USDC)
              ↓
       Select network (ERC20 / SOL / BASE)
              ↓
       Enter Naira amount → Bot calculates crypto amount
              ↓
       Bot shows bank details (Kuda / GTBank etc.)
              ↓
       User sends Naira → Uploads receipt
              ↓
       Admin group gets notification → Admin clicks [Verify]
              ↓
       User enters wallet address (validated per chain)
              ↓
       Admin clicks [Release Crypto]
              ↓
       Bot sends crypto to user wallet → Notifies both parties
       ```

### Order Lifecycle

       - `pending` — Waiting for user to upload payment receipt
       - `payment_claimed` — Receipt received, awaiting admin verification
       - `verified` — Admin confirmed payment, awaiting wallet address
       - `released` — Crypto sent successfully
       - `failed` — Payout failed (admin can retry)
       - `expired` — Order expired after 30 minutes
       - `cancelled` — User or admin cancelled

---

## Project Structure

       ```
       src/
       ├── bot/
       │   ├── handlers/          # Telegram flow handlers
       │   │   ├── start.js       # Onboarding
       │   │   ├── buy.js         # Buy crypto flow
       │   │   ├── payment.js     # Claim / verify / release payment
       │   │   └── admin.js       # Admin commands (/pending, /stats, /setrate)
       │   ├── keyboards/         # Inline and reply keyboards
       │   └── middleware/        # Session, auth, logging
       ├── models/                # MongoDB schemas
       │   ├── User.js
       │   ├── Order.js
       │   ├── Rate.js
       │   └── PayoutLog.js
       ├── services/              # Business logic
       │   ├── orderService.js    # Order CRUD, expiry, atomic status guards
       │   ├── paymentService.js  # Payout dispatcher (EVM vs Solana)
       │   ├── payoutService.js   # Chain-specific payout execution
       │   ├── rateService.js     # Rate management
       │   ├── notificationService.js  # Admin + user alerts
       │   └── backupService.js   # MongoDB backup to Google Drive
       ├── config/
       │   ├── database.js        # MongoDB connection
       │   └── bot.js             # Telegraf init + cron jobs
       ├── utils/
       │   ├── validators.js      # Address validation (EVM + Solana)
       │   └── constants.js       # Chains, order status, fees
       └── server.js              # Express + cron scheduler
       ```

---

## Prerequisites

       - Node.js >= 18
       - MongoDB (Atlas or self-hosted)
       - Telegram bot token from [@BotFather](https://t.me/BotFather)
       - Alchemy account (for Ethereum, Base, and Solana RPCs)
       - Bank account for Naira deposits

---

## Environment Variables

       Create a `.env` file in the project root:

       ```env
       # Telegram
       BOT_TOKEN=your_telegram_bot_token
       ADMIN_GROUP_ID=-1001234567890
       ADMIN_IDS=123456789,987654321

       # MongoDB
       MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/ketabot

       # Bank details (Naira deposits)
       BANK_NAME=Kuda
       ACCOUNT_NAME=Your Business Name
       ACCOUNT_NUMBER=1234567890

       # EVM RPCs (Alchemy)
       BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/your_key
       ETH_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your_key

       # Solana RPC (Alchemy)
       SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/your_key

       # Hot wallets
       EVM_WALLET_PRIVATE_KEY=0x...  # 64-char hex
       SOL_WALLET_SECRET=...         # base64-encoded secret
       ```

       > ⚠️ **Never commit `.env` to git.** It contains private keys and API keys.

---

## Installation

       ```bash
       npm install
       ```

---

## Running Locally

       ```bash
       npm start
       ```

       The bot uses **long polling** by default. For webhooks (Render deployment), set `WEBHOOK_URL` in `.env` and restart.

---

## Deployment (Render)

       1. Push code to GitHub
       2. Create a new Web Service on Render
       3. Connect your repo
       4. Set environment variables in Render dashboard
       5. Deploy
       6. After deploy, set `WEBHOOK_URL=https://your-app.onrender.com` in Render env
       7. Restart the service

---

## How Payouts Work

### EVM Chains (USDT-ERC20, ETH-ERC20, USDC-BASE)

       - Uses `ethers.js` v6
       - Single hot wallet (`EVM_WALLET_PRIVATE_KEY`) for all EVM chains
       - Checks ETH balance for gas before every token transfer
       - Sends ERC-20 tokens via `transfer()` ABI call
       - Transaction hash stored in `Order.txHash`
       - Explorer link sent to user: `etherscan.io` or `basescan.org`

### Solana (USDT-SOL)

       - Uses `@solana/web3.js` + `@solana/spl-token`
       - Separate hot wallet (`SOL_WALLET_SECRET`)
       - Checks SOL balance for gas (~0.01 SOL minimum)
       - Sends SPL USDT via Associated Token Account (ATA) transfer
       - Explorer link sent to user: `solscan.io`
       - Secret key format: base64-encoded 64-byte array (or extended format with first 32 bytes as seed)

---

## Key Design Decisions

       - **Atomic payouts:** Every status change uses `findOneAndUpdate` with the current status in the filter. Prevents double-release.
       - **Dual validation:** Wallet address is validated when user enters it, and again immediately before payout.
       - **Chain isolation:** EVM and Solana code paths are completely separate. Existing EVM chains are unaffected by Solana changes.
       - **No sensitive data in README:** Private keys, API keys, and wallet addresses are not committed to this file. See `.env.example` (if present) for required variables.

---

## Dependencies

       - **telegraf** — Telegram bot framework
       - **mongoose** — MongoDB ORM
       - **express** — Webhook server
       - **ethers** — Ethereum/Base/EVM interactions
       - **@solana/web3.js** — Solana RPC + wallet
       - **@solana/spl-token** — SPL token transfers
       - **node-cron** — Order expiry scheduler
       - **dotenv** — Environment config

---

## Testing Checklist

       - [ ] `npm start` launches without errors
       - [ ] `/start` opens main menu
       - [ ] Buy flow creates an order in MongoDB
       - [ ] Admin group receives new order notification
       - [ ] `/pending` lists open orders
       - [ ] `/setrate USDT 1630` updates the rate
       - [ ] Admin can verify payment and release crypto
       - [ ] Explorer link is correct for the chain used
       - [ ] Order expires after 30 minutes if abandoned

---

## License

       ISC

## View the Images REciept

       Summary of What You Can Do Now
       Action	How
       View a receipt in browser	https://keta-bot-79vw.onrender.com/receipt/<ORDER_REF>?key=<KEY>
       Download all receipts	node scripts/export-receipts.js
       Download one receipt	node scripts/export-receipts.js <ORDER_REF>
       View in Google Drive	Already working — receipts auto-upload to Drive