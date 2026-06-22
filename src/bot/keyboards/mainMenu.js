const { Markup } = require('telegraf');

const mainMenu = () =>
  Markup.keyboard([
    ['🟢 Buy Crypto', '🔴 Sell Crypto'],
    ['📜 My Orders', '📈 Rates']
  ]).resize();

const coinMenu = () =>
  Markup.keyboard([['USDT', 'BTC', 'ETH'], ['Cancel']])
    .resize()
    .oneTimeKeyboard();

const networkMenu = () =>
  Markup.keyboard([['TRC20', 'BEP20'], ['Cancel']])
    .resize()
    .oneTimeKeyboard();

const confirmMenu = () =>
  Markup.keyboard([['✅ Confirm', '❌ Cancel']])
    .resize()
    .oneTimeKeyboard();

const adminMenu = () =>
  Markup.keyboard([
    ['/pending', '/stats'],
    ['/setrate USDT 1630', '/help']
  ]).resize();

module.exports = {
  mainMenu,
  coinMenu,
  networkMenu,
  confirmMenu,
  adminMenu
};
