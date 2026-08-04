const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyBvnToken } = require('../utils/bvnToken');
const { createCustomer, submitKyc } = require('../services/anchorService');
const { getBot } = require('../config/bot');

/**
 * GET /bvn-verify — the hosted BVN input form.
 * Protected by a signed, expiring token tied to the user's telegramId.
 */
router.get('/bvn-verify', async (req, res) => {
  const { token } = req.query;
  const decoded = token ? verifyBvnToken(token) : null;

  if (!decoded) {
    return res.status(400).send(`
      <html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>❌ Invalid or expired link</h2>
        <p>This BVN verification link is invalid or has expired (links expire after 15 minutes).</p>
        <p>Please return to the bot and tap <strong>🔐 Verify BVN</strong> again to get a fresh link.</p>
      </body></html>
    `);
  }

  const user = await User.findOne({ telegramId: decoded.telegramId });
  if (!user) {
    return res.status(404).send(`
      <html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>❌ User not found</h2>
        <p>Please return to the bot and tap <strong>Reset</strong> to create your account.</p>
      </body></html>
    `);
  }

  if (user.bvnVerified) {
    return res.send(`
      <html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>✅ You are already BVN verified</h2>
        <p>No further action needed.</p>
      </body></html>
    `);
  }

  const fullName = [user.firstName, user.surname, user.otherNames].filter(Boolean).join(' ');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>BVN Verification — KetaBot</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f4f6f8; margin: 0; padding: 20px;
        }
        .card {
          max-width: 480px; margin: 40px auto; background: #fff;
          border-radius: 12px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        }
        h1 { font-size: 22px; margin: 0 0 8px; color: #1a1a2e; }
        p { color: #555; line-height: 1.5; margin: 8px 0; }
        label { display: block; font-weight: 600; margin: 16px 0 6px; color: #333; font-size: 14px; }
        input, select {
          width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 8px;
          font-size: 15px;
        }
        input:focus, select:focus { outline: 2px solid #018ef5; border-color: #018ef5; }
        .hint { font-size: 12px; color: #888; margin-top: 4px; }
        .notice {
          background: #fff8e6; border: 1px solid #ffd166; border-radius: 8px;
          padding: 12px 16px; font-size: 13px; color: #6b4e00; margin: 20px 0;
        }
        .notice a { color: #018ef5; }
        button {
          width: 100%; padding: 14px; background: #018ef5; color: #fff; border: none;
          border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 20px;
        }
        button:hover { background: #0179d1; }
        .error { background: #fdeaea; border: 1px solid #f5a0a0; color: #a11; padding: 12px 16px; border-radius: 8px; font-size: 14px; margin-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🔐 BVN Verification</h1>
        <p><strong>Account holder:</strong> ${fullName || 'N/A'}</p>
        <p><strong>Phone:</strong> ${user.phoneNumber || 'N/A'}</p>

        <div class="notice">
          ⚠️ Your BVN will be submitted directly to <strong>Anchor</strong> (a licensed financial institution)
          for verification against NIBSS. We <strong>do not store</strong> your raw BVN.
          This is a <strong>one-time</strong> verification for security and fraud prevention.
          Read our <a href="/terms" target="_blank">Terms & Conditions</a>.
        </div>

        <form method="POST" action="/bvn-verify/submit">
          <input type="hidden" name="token" value="${token}">

          <label for="bvn">BVN (11 digits)</label>
          <input type="text" id="bvn" name="bvn" inputmode="numeric" pattern="[0-9]{11}" maxlength="11" required placeholder="12345678901" autocomplete="off">
          <div class="hint">Your 11-digit Bank Verification Number</div>

          <label for="dob">Date of Birth</label>
          <input type="date" id="dob" name="dateOfBirth" required>

          <label for="gender">Gender</label>
          <select id="gender" name="gender" required>
            <option value="">Select...</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          <label for="email">Email Address</label>
          <input type="email" id="email" name="email" required placeholder="you@example.com">

          <button type="submit">Verify BVN</button>
        </form>

        ${req.query.error ? `<div class="error">${req.query.error}</div>` : ''}
      </div>
    </body>
    </html>
  `);
});

/**
 * POST /bvn-verify/submit — receives the form, creates the Anchor customer,
 * and submits the BVN KYC for verification. Raw BVN is never stored.
 */
router.post('/bvn-verify/submit', async (req, res) => {
  const { token, bvn, dateOfBirth, gender, email } = req.body || {};

  const decoded = token ? verifyBvnToken(token) : null;
  if (!decoded) {
    return res.status(400).send('Invalid or expired link. Please request a new one from the bot.');
  }

  // Basic validation
  if (!/^\d{11}$/.test(bvn || '')) {
    return res.redirect('/bvn-verify?token=' + encodeURIComponent(token) + '&error=' + encodeURIComponent('BVN must be exactly 11 digits.'));
  }
  if (!dateOfBirth || !gender || !email) {
    return res.redirect('/bvn-verify?token=' + encodeURIComponent(token) + '&error=' + encodeURIComponent('All fields are required.'));
  }

  const user = await User.findOne({ telegramId: decoded.telegramId });
  if (!user) {
    return res.status(404).send('User not found. Please return to the bot.');
  }

  if (user.bvnVerified) {
    return res.send(`
      <html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>✅ You are already BVN verified</h2>
        <p>You can close this page and return to the bot.</p>
      </body></html>
    `);
  }

  let customerId = user.anchorCustomerId;

  try {
    // Step 1: Create the Anchor customer (if not already created)
    if (!customerId) {
      customerId = await createCustomer({
        firstName: user.firstName,
        middleName: user.otherNames,
        lastName: user.surname,
        email,
        phoneNumber: user.phoneNumber
      });
      user.anchorCustomerId = customerId;
      await user.save();
    }

    // Step 2: Submit BVN KYC
    await submitKyc({ customerId, bvn, dateOfBirth, gender });

    // Step 3: Record consent timestamp (NDPR audit trail)
    user.bvnConsentAt = new Date();
    await user.save();

    res.send(`
      <html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>✅ Verification in progress</h2>
        <p>Your BVN verification has been submitted to Anchor.</p>
        <p>You will be notified in the bot once it completes (usually within a few minutes).</p>
        <p><a href="/terms">Terms & Conditions</a></p>
      </body></html>
    `);
  } catch (error) {
    console.error('BVN submit error:', error.message);
    res.redirect('/bvn-verify?token=' + encodeURIComponent(token) +
      '&error=' + encodeURIComponent('Verification submission failed: ' + error.message));
  }
});

/**
 * GET /terms — hosted Terms & Conditions page.
 */
router.get('/terms', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Terms & Conditions — KetaBot</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f6f8; margin: 0; padding: 20px; }
        .card { max-width: 720px; margin: 40px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        h1 { font-size: 24px; color: #1a1a2e; }
        h2 { font-size: 18px; color: #1a1a2e; margin-top: 24px; }
        p, li { color: #444; line-height: 1.6; }
        ul { padding-left: 20px; }
        .highlight { background: #e8f4fd; border-left: 4px solid #018ef5; padding: 12px 16px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>📜 Terms & Conditions — BVN Verification</h1>
        <p class="highlight"><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p>

        <h2>1. Purpose</h2>
        <p>We collect your BVN for a <strong>one-time verification</strong> to confirm your identity for security and fraud-prevention purposes and to enable payouts to you through our payment partner, <strong>Anchor</strong> (a licensed financial institution).</p>

        <h2>2. How Your BVN Is Handled</h2>
        <ul>
          <li>Your BVN is submitted <strong>directly to Anchor</strong> for validation against the Nigerian Inter-Bank Settlement System (NIBSS).</li>
          <li><strong>We do not store your raw BVN.</strong> We only store a masked version (e.g. *******1234) and your verification status.</li>
          <li>Anchor processes your data in accordance with its own privacy policy and applicable data protection regulations.</li>
        </ul>

        <h2>3. Consent</h2>
        <p>By proceeding with BVN verification, you explicitly consent to sharing your BVN with Anchor for identity verification purposes. This consent is recorded with a timestamp for audit purposes.</p>

        <h2>4. Data Protection</h2>
        <p>We comply with the Nigeria Data Protection Regulation (NDPR). Your personal data is processed securely and only for the stated purposes. You may request deletion of your data at any time by contacting support.</p>

        <h2>5. One-Time Use</h2>
        <p>BVN verification is performed <strong>once</strong> per account. Subsequent transactions do not require re-verification of your BVN.</p>

        <h2>6. Contact</h2>
        <p>For questions about these terms or your data, contact support via the KetaBot Telegram bot. Find the link in the bot's "Need help?" message.</p>
      </div>
    </body>
    </html>
  `);
});

module.exports = router;