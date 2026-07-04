const COINS = {
  USDT: 'USDT',
  BTC: 'BTC',
  ETH: 'ETH',
  USDC: 'USDC'
};

const NETWORKS = {
  TRC20: 'TRC20',
  BEP20: 'BEP20'
};

// Chain options combining coin + network
const CHAINS = {
  BTC: 'BTC',
  ETH: 'ETH',
  'USDT-TRC20': 'USDT-TRC20',
  'USDT-BEP20': 'USDT-BEP20',
  'USDC-TRC20': 'USDC-TRC20',
  'USDC-BEP20': 'USDC-BEP20'
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