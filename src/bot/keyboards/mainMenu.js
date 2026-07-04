const { Markup } = require('telegraf');

const mainMenu = () =>
  Markup.keyboard([
    ['🟢 Buy Crypto', '🔴 Sell Crypto'],
    ['📜 My Orders', '📈 Rates']
  ]).resize();

const coinMenu = () =>
  Markup.keyboard([['USDT', 'BTC', 'ETH', 'USDC' ], ['Cancel']])
    .resize()
    .oneTime();

const networkMenu = () =>
  Markup.keyboard([['TRC20', 'BEP20'], ['Cancel']])
    .resize()
    .oneTime();

const chainMenu = () =>
  Markup.keyboard([['BTC', 'ETH', 'USDT-TRC20'], ['USDT-BEP20', 'USDC-TRC20', 'USDC-BEP20'], ['Cancel']])
    .resize()
    .oneTime();

const confirmMenu = () =>
  Markup.keyboard([['✅ Confirm', '❌ Cancel']])
    .resize()
    .oneTime();

const adminMenu = () =>
  Markup.keyboard([
    ['/pending', '/stats'],
    ['/setrate USDT 1630', '/help']
  ]).resize();

module.exports = {
  mainMenu,
  coinMenu,
  networkMenu,
  chainMenu,
  confirmMenu,
  adminMenu
};