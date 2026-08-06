const { Markup } = require('telegraf');

const mainMenu = () =>
  Markup.keyboard([
    ['🟢 Buy Crypto', '🔴 Sell Crypto'],
    ['📜 My Orders', '📈 Rates'],
    ['🔍 Verify Identity', '✏️ My Profile'],
    ['Reset']
  ]).resize();

const chainMenu = () =>
  Markup.keyboard([
    ['USDC-BASE', 'ETH-ERC20'],
    ['USDT-SOL'],
    ['Cancel']
  ])
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

const phoneMenu = () =>
  Markup.keyboard([
    [Markup.button.contactRequest('📱 Share Phone Number')],
    ['✏️ Enter Manually'],
    ['Cancel']
  ])
    .resize()
    .oneTime();

const skipMenu = () =>
  Markup.keyboard([['⏭️ Skip']])
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
    ['🔍 Verify Identity', '✏️ My Profile'],
    ['pending', 'stats', 'balances'],
    ['setrate', 'help']
  ]).resize();

module.exports = {
  mainMenu,
  chainMenu,
  cancelMenu,
  confirmMenu,
  phoneMenu,
  skipMenu,
  adminMenu,
  combinedAdminMenu
};