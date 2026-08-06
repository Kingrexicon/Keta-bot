const { Markup } = require('telegraf');
const User = require('../../models/User');
const { DEEPIDV_URL } = require('../../utils/constants');
const { mainMenu } = require('../keyboards/mainMenu');
const { createBvnToken } = require('../../utils/bvnToken');

/**
 * Verify Identity handler — shows the user's separate BVN and KYC statuses.
 * - BVN (via Anchor): enables payments/transactions. KYC stays at 1/2.
 * - DeepIDV KYC: enables transactions above $100. KYC fully approved.
 */
async function verifyHandler(ctx) {
  const telegramId = ctx.from.id;
  let user = await User.findOne({ telegramId });

  if (!user) {
    await ctx.reply('❌ No account found. Please use /start to create an account first.');
    return;
  }

  const bvnVerified = !!user.bvnVerified;
  const kycStatus = user.kycStatus || 'PENDING';

  let message =
    '🛡️ <b>Verification Status</b>\n\n' +
    `🔐 <b>BVN:</b> ${bvnVerified ? '✅ Verified' : '❌ Not verified'}\n` +
    `📊 <b>KYC:</b> ${kycStatus === 'VERIFIED' ? '✅ Approved' : '❌ Pending (1/2)'}\n\n`;

  const buttons = [];

  if (!bvnVerified) {
    const appBase = process.env.APP_BASE_URL || 'https://keta-bot-79vw.onrender.com';
    const token = createBvnToken(user.telegramId);
    const verifyUrl = `${appBase}/bvn-verify?token=${token}`;
    message += '🔐 <b>BVN verification</b> enables payments and transactions.\n';
    buttons.push([Markup.button.url('🔐 Verify BVN', verifyUrl)]);
  }

  if (kycStatus !== 'VERIFIED') {
    message += '\n📊 <b>KYC approval</b> (via DeepIDV) unlocks transactions above <b>$100</b>.\n';
    if (DEEPIDV_URL) {
      buttons.push([Markup.button.url('📊 Verify KYC with DeepIDV', DEEPIDV_URL)]);
    }
  }

  if (!bvnVerified && kycStatus === 'VERIFIED') {
    message += '\nYour KYC is approved, but BVN verification is still required for payments.\n';
  }

  if (buttons.length === 0) {
    message += '\n✅ You are fully verified. You can place orders of any amount.';
  }

  await ctx.reply(message, {
    parse_mode: 'HTML',
    ...mainMenu(),
    ...(buttons.length > 0 ? { inline_keyboard: buttons } : {})
  });
}

module.exports = {
  verifyHandler
};