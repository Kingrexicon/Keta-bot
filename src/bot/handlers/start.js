const User = require('../../models/User');
const { mainMenu } = require('../keyboards/mainMenu');

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

  const welcomeMessage = `
🎉 <b>Welcome to KetaBot</b>

Your telegram ID: <code>${id}</code>

I'm your crypto exchange bot. Buy and sell USDT, BTC, and ETH with ease.

What would you like to do?
  `;

  await ctx.reply(welcomeMessage, {
    parse_mode: 'HTML',
    ...mainMenu()
  });
}

module.exports = startHandler;
