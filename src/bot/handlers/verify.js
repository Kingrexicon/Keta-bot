const { Markup } = require('telegraf');
const User = require('../../models/User');
const { DEEPIDV_URL } = require('../../utils/constants');
const { mainMenu } = require('../keyboards/mainMenu');

async function verifyHandler(ctx) {
  const telegramId = ctx.from.id;
  let user = await User.findOne({ telegramId });

  if (!user) {
    await ctx.reply('❌ No account found. Please use /start to create an account first.');
    return;
  }

  const status = user.kycStatus || 'PENDING';

  if (status === 'VERIFIED') {
    await ctx.reply(
      '✅ <b>Identity Verified</b>\n\nYou are already verified with DeepIDV. You can place orders of any amount.\n\nVerified on: ' + (user.kycVerifiedAt ? new Date(user.kycVerifiedAt).toLocaleString() : 'N/A'),
      { parse_mode: 'HTML', ...mainMenu() }
    );
    return;
  }

  if (status === 'REJECTED') {
    await ctx.reply(
      '❌ <b>Verification Rejected</b>\n\nYour previous verification attempt was rejected. Please contact support or try again.\n\nYou may verify again using the link below:',
      { parse_mode: 'HTML', ...mainMenu(),
        ...(DEEPIDV_URL ? {
          inline_keyboard: [
            [Markup.button.url('🔍 Verify with DeepIDV', DEEPIDV_URL)]
          ]
        } : {})
      }
    );
    return;
  }

  // PENDING or default — send verification link
  await ctx.reply(
    '🔍 <b>DeepIDV Identity Verification</b>\n\nTo unlock higher purchase limits, you need to complete identity verification.\n\nClick the button below to start verification:',
    { parse_mode: 'HTML',
      ...(DEEPIDV_URL ? {
        inline_keyboard: [
          [Markup.button.url('🔍 Verify with DeepIDV', DEEPIDV_URL)]
        ]
      } : {})
    }
  );
}

module.exports = {
  verifyHandler
};