const crypto = require('crypto');

/**
 * Create a signed, expiring token for the BVN verification form link.
 * The token carries the user's telegramId and expires after a set TTL.
 * HMAC-signed with a server secret so it cannot be forged or reused by others.
 */
function createBvnToken(telegramId, ttlMs = 15 * 60 * 1000) {
  const secret = process.env.BVN_TOKEN_SECRET;
  if (!secret) {
    throw new Error('BVN_TOKEN_SECRET is not configured');
  }

  const expiresAt = Date.now() + ttlMs;
  const payload = `${telegramId}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Base64url encode the payload+signature so it's URL-safe
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

/**
 * Verify a BVN form token.
 * @returns {{ telegramId: number, expiresAt: number } | null} decoded payload or null if invalid/expired
 */
function verifyBvnToken(token) {
  const secret = process.env.BVN_TOKEN_SECRET;
  if (!secret) {
    throw new Error('BVN_TOKEN_SECRET is not configured');
  }

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;

    const [telegramId, expiresAtStr, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || isNaN(parseInt(telegramId, 10))) return null;

    // Verify signature
    const payload = `${telegramId}:${expiresAtStr}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (signature !== expected) return null;

    // Check expiry
    if (Date.now() > expiresAt) return null;

    return { telegramId: parseInt(telegramId, 10), expiresAt };
  } catch (e) {
    return null;
  }
}

module.exports = {
  createBvnToken,
  verifyBvnToken
};