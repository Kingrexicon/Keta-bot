const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyBvnToken } = require('../utils/bvnToken');
const { createCustomer, submitKyc, getCustomer, getVerifications } = require('../services/anchorService');
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

    // Step 3: Save email + gender to the user record, store a masked BVN
    // (only the last 4 digits — never the raw BVN), and record consent timestamp.
    user.email = email;
    user.gender = gender;
    user.bvnMasked = '*******' + bvn.slice(-4);
    user.bvnConsentAt = new Date();
    await user.save();

    // Start a background poll as a fallback in case the webhook doesn't arrive.
    // This queries Anchor's API for the verification status and updates the user
    // + notifies them in Telegram when it completes.
    startVerificationPoll(user.telegramId, customerId);

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BVN Verification — KetaBot</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f6f8; margin: 0; padding: 20px; }
          .card { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; }
          h1 { font-size: 22px; margin: 0 0 8px; color: #1a1a2e; }
          p { color: #555; line-height: 1.5; margin: 8px 0; }
          .spinner { display: inline-block; width: 40px; height: 40px; border: 4px solid #e0e0e0; border-top-color: #018ef5; border-radius: 50%; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .status { font-size: 15px; font-weight: 600; color: #333; margin: 12px 0; }
          .btn { display: inline-block; padding: 12px 24px; background: #018ef5; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 16px; }
          .btn:hover { background: #0179d1; }
          .hidden { display: none; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🔐 BVN Verification</h1>
          <div id="loading">
            <div class="spinner"></div>
            <p class="status">Verification in progress...</p>
            <p>Your BVN has been submitted to Anchor for verification.<br>This usually takes a few minutes.</p>
          </div>
          <div id="success" class="hidden">
            <h1>✅ Verified!</h1>
            <p>Your BVN has been successfully verified.</p>
            <a class="btn" href="https://t.me/KetaBot" target="_blank">Return to Telegram</a>
          </div>
          <div id="error" class="hidden">
            <h1>❌ Verification Failed</h1>
            <p id="errorMsg">There was an issue verifying your BVN.</p>
            <a class="btn" href="https://t.me/KetaBot" target="_blank">Return to Telegram</a>
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #888;"><a href="/terms">Terms & Conditions</a></p>
        </div>
        <script>
          const token = ${JSON.stringify(token)};
          async function checkStatus() {
            try {
              const res = await fetch('/bvn-status?token=' + encodeURIComponent(token));
              const data = await res.json();
              if (data.status === 'VERIFIED') {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('success').classList.remove('hidden');
              } else if (data.status === 'REJECTED' || data.status === 'ERROR') {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('errorMsg').textContent = data.message || 'There was an issue verifying your BVN.';
                document.getElementById('error').classList.remove('hidden');
              } else {
                setTimeout(checkStatus, 5000);
              }
            } catch (e) {
              setTimeout(checkStatus, 10000);
            }
          }
          checkStatus();
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('BVN submit error:', error.message);

    // Handle "Kyc already completed" — the customer is already verified on Anchor.
    // Treat this as a success: update the DB, notify the user, and show a success page.
    if (error.message.includes('412') || error.message.toLowerCase().includes('kyc already completed')) {
      try {
        // Save email + gender even on this path, plus a masked BVN (last 4 digits only)
        user.email = email;
        user.gender = gender;
        user.bvnMasked = '*******' + bvn.slice(-4);
        user.bvnConsentAt = new Date();
        await user.save();

        // Query Anchor for the customer's status
        let approved = false;
        if (user.anchorCustomerId) {
          try {
            const customer = await getCustomer(user.anchorCustomerId);
            const status = customer?.data?.attributes?.status || customer?.data?.attributes?.kycStatus || '';
            approved = ['approved', 'verified', 'ACTIVE'].includes(status);
          } catch (e) {
            console.error('Error checking customer status on 412:', e.message);
          }
        }

        if (approved || user.bvnVerified) {
          // Mark as BVN-verified in DB (does NOT affect KYC status — KYC is separate)
          if (!user.bvnVerified) {
            user.bvnVerified = true;
            user.bvnVerifiedAt = new Date();
            await user.save();
            console.log(`✅ [412] BVN verified for telegramId ${user.telegramId}`);

            // Notify the user in Telegram
            try {
              const bot = getBot();
              if (bot && bot.telegram) {
                await bot.telegram.sendMessage(
                  user.telegramId,
                  '✅ <b>BVN Verified Successfully!</b>\n\nYour BVN has been verified for security and fraud prevention. You can now receive payouts.',
                  { parse_mode: 'HTML' }
                );
              }
            } catch (e) {
              console.error('Failed to notify user of BVN approval (412):', e.message);
            }
          }

          return res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>BVN Verification — KetaBot</title>
              <style>
                * { box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f6f8; margin: 0; padding: 20px; }
                .card { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; }
                h1 { font-size: 22px; margin: 0 0 8px; color: #1a1a2e; }
                p { color: #555; line-height: 1.5; margin: 8px 0; }
                .btn { display: inline-block; padding: 12px 24px; background: #018ef5; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 16px; }
                .btn:hover { background: #0179d1; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>✅ Already Verified</h1>
                <p>Your BVN has already been verified successfully.</p>
                <p>You can now receive payouts.</p>
                <a class="btn" href="https://t.me/KetaBot" target="_blank">Return to Telegram</a>
              </div>
            </body>
            </html>
          `);
        }
      } catch (e) {
        console.error('Error handling 412 path:', e.message);
      }
    }

    res.redirect('/bvn-verify?token=' + encodeURIComponent(token) +
      '&error=' + encodeURIComponent('Verification submission failed: ' + error.message));
  }
});

/**
 * GET /bvn-status — polled by the success page to check verification status.
 * Returns the current BVN verification status for the user.
 */
router.get('/bvn-status', async (req, res) => {
  const { token } = req.query;
  const decoded = token ? verifyBvnToken(token) : null;

  if (!decoded) {
    return res.status(400).json({ status: 'ERROR', message: 'Invalid or expired token' });
  }

  const user = await User.findOne({ telegramId: decoded.telegramId });
  if (!user) {
    return res.status(404).json({ status: 'ERROR', message: 'User not found' });
  }

  if (user.bvnVerified) {
    return res.json({ status: 'VERIFIED' });
  }

  if (user.kycStatus === 'REJECTED') {
    return res.json({ status: 'REJECTED', message: 'Your BVN could not be verified. Please check your details and try again.' });
  }

  return res.json({ status: 'PENDING' });
});

/**
 * Background poll: query Anchor for the customer's verification status.
 * Runs every 30 seconds, up to 10 attempts (5 minutes), then gives up.
 * This is a fallback for when the webhook doesn't arrive.
 */
async function startVerificationPoll(telegramId, customerId) {
  let attempts = 0;
  const maxAttempts = 10;

  const poll = async () => {
    attempts++;
    try {
      // Try to get the customer's verification status from Anchor
      const customer = await getCustomer(customerId);
      const status = customer?.data?.attributes?.status || customer?.data?.attributes?.kycStatus || '';

      if (status === 'approved' || status === 'verified' || status === 'ACTIVE') {
        // BVN approved — update the user (does NOT affect KYC status — KYC is separate)
        const user = await User.findOne({ telegramId });
        if (user && !user.bvnVerified) {
          user.bvnVerified = true;
          user.bvnVerifiedAt = new Date();
          await user.save();
          console.log(`✅ [POLL] BVN verified for telegramId ${telegramId}`);

          // Notify the user in Telegram
          try {
            const bot = getBot();
            if (bot && bot.telegram) {
              await bot.telegram.sendMessage(
                telegramId,
                '✅ <b>BVN Verified Successfully!</b>\n\nYour BVN has been verified for security and fraud prevention. You can now receive payouts.',
                { parse_mode: 'HTML' }
              );
            }
          } catch (e) {
            console.error('Failed to notify user of BVN approval (poll):', e.message);
          }
        }
        return; // Done
      }

      if (status === 'rejected' || status === 'failed') {
        const user = await User.findOne({ telegramId });
        if (user) {
          user.kycStatus = 'REJECTED';
          await user.save();
        }
        return; // Done
      }
    } catch (e) {
      console.error(`[POLL] Error checking verification status (attempt ${attempts}):`, e.message);
    }

    if (attempts < maxAttempts) {
      setTimeout(poll, 30000);
    } else {
      console.log(`[POLL] Gave up polling for telegramId ${telegramId} after ${maxAttempts} attempts`);
    }
  };

  // Start polling after a short delay
  setTimeout(poll, 15000);
}

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
          <li><strong>We do not store your raw BVN.</strong> We only store a masked version showing the last 4 digits (e.g. *******1234) and your verification status, for support and audit purposes.</li>
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