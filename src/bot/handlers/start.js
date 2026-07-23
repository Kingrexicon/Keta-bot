const User = require('../../models/User');
const Admin = require('../../models/Admin');
const { mainMenu, combinedAdminMenu } = require('../keyboards/mainMenu');
const { Markup } = require('telegraf');

async function isAdminUser(telegramId) {
  const admin = await Admin.findOne({ telegramId, active: true });
  if (admin) return true;
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  return adminIds.includes(telegramId);
}

async function startHandler(ctx) {
  // /start is the safe escape hatch for users stuck in any bot flow.
  ctx.session = {};

  const { id, username, first_name } = ctx.from;

  let user = await User.findOne({ telegramId: id });

  if (!user) {
    user = await User.create({
      telegramId: id,
      username,
      firstName: first_name
    });
  }

  // Check if user is in the admin group
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  const isInAdminGroup = ctx.chat && ctx.chat.id.toString() === adminGroupId;
  const isAdmin = await isAdminUser(id);

  if (isInAdminGroup && isAdmin) {
    const message = `
🎉 <b>KetaBot Admin Panel</b>

<b>Admin Commands:</b>
/pending - View pending orders
/stats - Order statistics
/setrate - Update exchange rates
/balances - Check wallet balances

Use the buttons below to manage the bot.
    `;
    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...combinedAdminMenu()
    });
  } else {
    const welcomeMessage = `
🎉 <b>Welcome to KetaBot</b>

I'm your crypto exchange bot. Buy and sell USDT on sol network. USDC and ETH on EVM  networks with ease.

What would you like to do?
    `;

    await ctx.reply(welcomeMessage, {
      parse_mode: 'HTML',
      ...mainMenu()
    });
  }

  await ctx.reply(
    'Need help?',
    Markup.inlineKeyboard([
      [Markup.button.url('Contact Keta Support', 'https://wa.me/2349020761615?text=Hello%20KETA.NG')]
    ])
  );
}

module.exports = startHandler;
