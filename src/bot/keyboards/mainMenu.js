const { Markup } = require('telegraf');

const mainMenu = () =>
  Markup.keyboard([
    ['🟢 Buy Crypto', '🔴 Sell Crypto'],
    ['📜 My Orders', '📈 Rates']
  ]).resize();

const chainMenu = () =>
  Markup.keyboard([['USDC-BASE', 'ETH-ERC20', 'USDT-ERC20'], ['Cancel']])
    .resize()
    .oneTime();

const cancelMenu = () =>
  Markup.keyboard([['Cancel']])
    .resize()
    .oneTime();

const confirmMenu = () =>
  Markup.keyboard([['✅ Confirm', '❌ Cancel']])
    .resize()
    .oneTime();

const adminMenu = () =>
  Markup.keyboard([
    ['pending', 'stats', 'balances'],
    ['setrate USDT 1630', 'help']
  ]).resize();

const combinedAdminMenu = () =>
  Markup.keyboard([
    ['🟢 Buy Crypto', '🔴 Sell Crypto'],
    ['📜 My Orders', '📈 Rates'],
    ['pending', 'stats', 'balances'],
    ['setrate USDT 1630', 'help']
  ]).resize();

module.exports = {
  mainMenu,
  chainMenu,
  cancelMenu,
  confirmMenu,
  adminMenu,
  combinedAdminMenu
};
