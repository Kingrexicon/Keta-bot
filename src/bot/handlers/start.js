const User = require('../../models/User');
const { mainMenu, adminMenu } = require('../keyboards/mainMenu');
const Admin = require('../../models/Admin');

async function isAdminUser(id) {
  const admin = await Admin.findOne({ telegramId: id, active: true });
  if (admin) return true;
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  return adminIds.includes(id);
}

async function startHandler(ctx) {
  const { id, username, first_name } = ctx.from;

  let user = await User.findOne({ telegramId: id });

  if (!user) {
    user = await User.create({
      telegramId: id,
      username,
      firstName: first_name
    });
  }

  const isAdmin = await isAdminUser(id);

  const welcomeMessage = isAdmin ? `
🎉 <b>Welcome back, Admin!</b>

Your telegram ID: <code>${id}</code>

<b>Admin Commands:</b>
/pending - View pending orders
/stats - Order statistics
/setrate - Update exchange rates
/balances - Check wallet balances

Use the buttons below to manage the bot.
  ` : `
🎉 <b>Welcome to KetaBot</b>

Your telegram ID: <code>${id}</code>

I'm your crypto exchange bot. Buy and sell USDT, USDC, and ETH on EVM networks with ease.

What would you like to do?
  `;

  await ctx.reply(welcomeMessage, {
    parse_mode: 'HTML',
    ...(isAdmin ? adminMenu() : mainMenu())
  });
}

module.exports = startHandler;
