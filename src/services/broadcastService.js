const User = require('../models/User');
const { mainMenu } = require('../bot/keyboards/mainMenu');

const BATCH_DELAY_MS = 35; // ~28 msg/sec, safely under Telegram's 30/sec limit
const RETRY_DELAY_MS = 2000; // wait before retrying after a 429

/**
 * Send a message to a single user with retry/backoff for rate limits.
 * Returns 'sent' | 'blocked' | 'failed'.
 */
async function sendWithRetry(telegram, chatId, message, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await telegram.sendMessage(chatId, message, options);
      return 'sent';
    } catch (err) {
      // User blocked the bot or chat not found — skip permanently
      if (err.code === 403 || err.code === 400) {
        return 'blocked';
      }
      // Rate limited — wait and retry
      if (err.code === 429) {
        const retryAfter = err.parameters?.retry_after || RETRY_DELAY_MS / 1000;
        await new Promise(res => setTimeout(res, retryAfter * 1000));
        continue;
      }
      // Other errors — retry a few times then give up
      if (attempt === maxRetries) {
        return 'failed';
      }
      await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
    }
  }
  return 'failed';
}

/**
 * Broadcast a reset/welcome message to all registered users.
 * Used automatically after a deploy when UPDATE_MESSAGE is set.
 */
async function broadcastReset(updateMessage) {
  const { getBot } = require('../config/bot');
  const bot = getBot();
  if (!bot) {
    throw new Error('Bot not initialized — cannot broadcast');
  }

  const users = await User.find({}).select('telegramId').lean();
  console.log(`📢 Broadcasting reset to ${users.length} users...`);

  const message = `
🔄 <b>KetaBot has been updated!</b>

${updateMessage ? updateMessage + '\n\n' : ''}🎉 <b>Welcome to KetaBot</b>

I'm your crypto exchange bot. Buy and sell USDT on sol network. USDC and ETH on EVM networks with ease.

What would you like to do?
  `;

  return broadcastToUsers(bot.telegram, users, message);
}

/**
 * Broadcast a custom message to all registered users (admin /broadcast command).
 */
async function broadcastMessage(text) {
  const { getBot } = require('../config/bot');
  const bot = getBot();
  if (!bot) {
    throw new Error('Bot not initialized — cannot broadcast');
  }

  const users = await User.find({}).select('telegramId').lean();
  console.log(`📢 Broadcasting custom message to ${users.length} users...`);

  const message = `${text}\n\n🎉 <b>Welcome to KetaBot</b>\n\nI'm your crypto exchange bot. Buy and sell USDT on sol network. USDC and ETH on EVM networks with ease.\n\nWhat would you like to do?`;

  return broadcastToUsers(bot.telegram, users, message);
}

/**
 * Core sending loop with rate limiting and error handling.
 */
async function broadcastToUsers(telegram, users, message) {
  let sent = 0;
  let blocked = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const result = await sendWithRetry(telegram, user.telegramId, message, {
      parse_mode: 'HTML',
      ...mainMenu()
    });

    if (result === 'sent') sent++;
    else if (result === 'blocked') blocked++;
    else failed++;

    // Rate limit: small delay between each message
    if (i < users.length - 1) {
      await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
    }

    // Log progress every 50 users
    if ((i + 1) % 50 === 0) {
      console.log(`📢 Broadcast progress: ${i + 1}/${users.length} (sent: ${sent}, blocked: ${blocked}, failed: ${failed})`);
    }
  }

  const summary = `Sent: ${sent} | Blocked: ${blocked} | Failed: ${failed}`;
  console.log(`✅ Broadcast complete — ${summary}`);
  return summary;
}

module.exports = {
  broadcastReset,
  broadcastMessage
};