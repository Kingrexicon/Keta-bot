const COINS = {
  ETH: 'ETH',
  USDT: 'USDT',
  USDC: 'USDC'
};

const NETWORKS = {
  ERC20: 'ERC20',
  BASE_SEPOLIA: 'BASE_SEPOLIA'
};

// Chain options combining coin + network
const CHAINS = {
  'USDC-BASE-SEPOLIA': 'USDC-BASE-SEPOLIA',
  'ETH-ERC20': 'ETH-ERC20',
  'USDT-ERC20': 'USDT-ERC20'
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