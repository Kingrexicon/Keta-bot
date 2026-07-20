const { Markup } = require('telegraf');

const mainMenu = () =>
  Markup.keyboard([
    ['🟢 Buy Crypto', '🔴 Sell Crypto'],
    ['📜 My Orders', '📈 Rates'],
    ['🔍 Verify Identity'],
    ['Reset']
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
    ['setrate', 'help']
  ]).resize();

const combinedAdminMenu = () =>
  Markup.keyboard([
    ['🟢 Buy Crypto', '🔴 Sell Crypto'],
    ['📜 My Orders', '📈 Rates'],
    ['🔍 Verify Identity'],
    ['pending', 'stats', 'balances'],
    ['setrate', 'help']
  ]).resize();

module.exports = {
  mainMenu,
  chainMenu,
  cancelMenu,
  confirmMenu,
  adminMenu,
  combinedAdminMenu
};
