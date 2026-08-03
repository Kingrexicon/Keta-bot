const COINS = {
  ETH: 'ETH',
  USDT: 'USDT',
  USDC: 'USDC'
};

const NETWORKS = {
  ERC20: 'ERC20',
  BASE: 'BASE',
  SOLANA: 'SOLANA'
};

// Chain options combining coin + network
const CHAINS = {
  'USDC': 'USDC-BASE',
  'ETH-ERC20': 'ETH-ERC20',
  'USDT-ERC20': 'USDT-ERC20',
  'USDT-SOL': 'USDT-SOL'
};

const ORDER_STATUS = {
  PENDING: 'pending',
  PAYMENT_CLAIMED: 'payment_claimed',
  VERIFIED: 'verified',
  RELEASED: 'released',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
};

const ORDER_EXPIRY_MINUTES = 30;

const FEE = 500;

// USD buy limits
const MIN_BUY_USD = 1;
const LARGE_BUY_USD_THRESHOLD = 100;

// DeepIDV verification link (replace with actual DeepIDV URL)
const DEEPIDV_URL = 'https://deepidv.com/verify';

// Safety guards — prevent absurd orders caused by misconfigured rates
// Minimum fiat amount (NGN) an order can be worth. If a rate is set to a
// stablecoin-scale value for ETH, a $20 buy would compute to ~₦8 — this guard blocks it.
const MIN_FIAT_AMOUNT = 1000;

// Minimum expected buy rate per coin (NGN). Used as a sanity check when admins
// set rates, so a typo like 1430 instead of 2900000 for ETH is caught immediately.
const MIN_RATE_BY_COIN = {
  ETH: 100000,
  USDT: 500,
  USDC: 500
};

// Minimum effective NGN-per-USD rate before we warn the user that the order
// amount looks abnormally low (e.g. ₦8 for $20 = 0.4 NGN/USD).
const MIN_EFFECTIVE_NGN_USD_RATE = 100;

module.exports = {
  COINS,
  NETWORKS,
  CHAINS,
  ORDER_STATUS,
  ORDER_EXPIRY_MINUTES,
  FEE,
  MIN_BUY_USD,
  LARGE_BUY_USD_THRESHOLD,
  DEEPIDV_URL,
  MIN_FIAT_AMOUNT,
  MIN_RATE_BY_COIN,
  MIN_EFFECTIVE_NGN_USD_RATE
};