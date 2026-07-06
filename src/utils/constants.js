const COINS = {
  SOL: 'SOL',
  TRX: 'TRX',
  USDT: 'USDT',
  USDC: 'USDC'
};

const NETWORKS = {
  TRC20: 'TRC20'
};

// Chain options combining coin + network
const CHAINS = {
  SOL: 'SOL',
  'USDT-SOL': 'USDT-SOL',
  'USDC-SOL': 'USDC-SOL',
  TRX: 'TRX',
  'USDT-TRC20': 'USDT-TRC20',
  'USDC-TRC20': 'USDC-TRC20'
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

module.exports = {
  COINS,
  NETWORKS,
  CHAINS,
  ORDER_STATUS,
  ORDER_EXPIRY_MINUTES,
  FEE
};