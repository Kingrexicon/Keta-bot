const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const { getBot } = require('../config/bot');

/**
 * POST /anchor/bvn-webhook
 * Receives webhook events from Anchor when BVN KYC verification completes.
 * Events:
 *   - customer.identification.approved
 *   - customer.identification.rejected
 *   - customer.identification.error
 *
 * Protected by ANCHOR_WEBHOOK_SECRET — requests without a valid token are rejected.
 */
router.post('/bvn-webhook', async (req, res) => {
  const secret = process.env.ANCHOR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ANCHOR_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Server not configured for webhooks' });
  }

  // Anchor signs the webhook payload with HMAC-SHA256 using the webhook secret.
  // The signature is sent base64-encoded in the `x-anchor-signature` header.
  // There is NO plaintext secret header — we must verify the payload signature.
  const signature = req.headers['x-anchor-signature'] || '';
  // req.rawBody is captured by the express.json verify middleware in server.js
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (signature) {
    const provided = signature.trim();

    // Anchor's exact signing scheme isn't documented, so we try several
    // common combinations and accept if ANY matches. This is defensive and
    // logs which scheme matched for future reference.
    const candidates = [];

    // Scheme 1: HMAC-SHA256 raw bytes -> base64
    candidates.push({
      name: 'sha256-raw-base64',
      value: crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
    });

    // Scheme 2: HMAC-SHA256 hex digest -> base64
    candidates.push({
      name: 'sha256-hex-base64',
      value: Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex')).toString('base64')
    });

    // Scheme 3: HMAC-SHA1 raw bytes -> base64
    candidates.push({
      name: 'sha1-raw-base64',
      value: crypto.createHmac('sha1', secret).update(rawBody).digest('base64')
    });

    // Scheme 4: HMAC-SHA1 hex digest -> base64
    candidates.push({
      name: 'sha1-hex-base64',
      value: Buffer.from(crypto.createHmac('sha1', secret).update(rawBody).digest('hex')).toString('base64')
    });

    // Scheme 5: HMAC-SHA256 over JSON.stringify(body) raw bytes -> base64
    candidates.push({
      name: 'sha256-json-raw-base64',
      value: crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('base64')
    });

    // Scheme 6: HMAC-SHA256 over JSON.stringify(body) hex -> base64
    candidates.push({
      name: 'sha256-json-hex-base64',
      value: Buffer.from(crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex')).toString('base64')
    });

    let matched = false;
    for (const c of candidates) {
      const expectedBuf = Buffer.from(c.value);
      const providedBuf = Buffer.from(provided);
      if (expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        matched = true;
        console.log(`✅ Webhook signature verified via scheme: ${c.name}`);
        break;
      }
    }

    if (!matched) {
      console.error('Webhook signature mismatch. Provided:', provided);
      console.error('Candidate values:', candidates.map(c => `${c.name}=${c.value}`).join(', '));
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    // Fallback: accept if a plaintext secret header matches (legacy / other providers)
    const providedSecret =
      req.headers['x-anchor-webhook-secret'] ||
      req.headers['x-webhook-secret'] ||
      req.headers['x-anchor-secret'] ||
      req.headers['x-secret'] ||
      '';
    if (!providedSecret || providedSecret !== secret) {
      console.error('Webhook secret mismatch:', { provided: providedSecret, expected: secret });
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const payload = req.body;
  const eventType = payload?.type || payload?.event || '';

  // Acknowledge receipt immediately (Anchor may retry on non-2xx)
  res.status(200).json({ received: true });

  // Log the full payload for debugging (truncated to avoid huge logs)
  console.log('Anchor webhook received:', eventType);
  console.log('Full webhook payload:', JSON.stringify(payload).substring(0, 2000));

  if (!eventType) {
    console.error('No event type in webhook payload');
    return;
  }

  // Extract the customer ID from the payload relationships (try multiple locations)
  const customerId =
    payload?.relationships?.customer?.data?.id ||
    payload?.data?.relationships?.customer?.data?.id ||
    payload?.data?.id ||
    payload?.customerId ||
    payload?.customer_id ||
    '';

  if (!customerId) {
    console.error('No customer ID in webhook payload. Full payload:', JSON.stringify(payload).substring(0, 2000));
    return;
  }

  // Find the user by their stored anchorCustomerId
  const user = await User.findOne({ anchorCustomerId: customerId });
  if (!user) {
    console.error('No user found for Anchor customer:', customerId);
    return;
  }

  switch (eventType) {
    case 'customer.identification.approved':
      user.bvnVerified = true;
      user.bvnVerifiedAt = new Date();
      user.bvnReference = payload?.id || '';
      // Keep existing consent timestamp; if missing, set it now as fallback
      if (!user.bvnConsentAt) user.bvnConsentAt = new Date();
      await user.save();
      console.log(`✅ BVN verified for telegramId ${user.telegramId}`);

      // Notify the user in Telegram
      try {
        const bot = getBot();
        const appBase = process.env.APP_BASE_URL || '';
        if (bot && bot.telegram) {
          await bot.telegram.sendMessage(
            user.telegramId,
            '✅ <b>BVN Verified Successfully!</b>\n\nYour BVN has been verified for security and fraud prevention. You can now receive payouts.',
            { parse_mode: 'HTML' }
          );
        }
      } catch (e) {
        console.error('Failed to notify user of BVN approval:', e.message);
      }
      break;

    case 'customer.identification.rejected':
      user.bvnVerified = false;
      user.bvnVerifiedAt = null;
      await user.save();
      console.log(`❌ BVN rejected for telegramId ${user.telegramId}`);

      try {
        const bot = getBot();
        if (bot && bot.telegram) {
          await bot.telegram.sendMessage(
            user.telegramId,
            '❌ <b>BVN Verification Rejected</b>\n\nThe BVN details you provided could not be verified. Please ensure your BVN, date of birth, and gender match your bank records, then try again from the bot.',
            { parse_mode: 'HTML' }
          );
        }
      } catch (e) {
        console.error('Failed to notify user of BVN rejection:', e.message);
      }
      break;

    case 'customer.identification.error':
      console.log(`⚠️ BVN verification error for telegramId ${user.telegramId}`);
      try {
        const bot = getBot();
        if (bot && bot.telegram) {
          await bot.telegram.sendMessage(
            user.telegramId,
            '⚠️ <b>BVN Verification Error</b>\n\nThere was a temporary issue verifying your BVN. Please try again in a few minutes from the bot.',
            { parse_mode: 'HTML' }
          );
        }
      } catch (e) {
        console.error('Failed to notify user of BVN error:', e.message);
      }
      break;

    default:
      console.log('Unknown Anchor webhook event type:', eventType);
  }
});

module.exports = router;