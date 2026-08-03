/**
 * Backfill receiptViewUrl for existing Payment documents
 * Usage: node scripts/backfill-receipt-urls.js
 */
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const crypto = require('crypto');
const mongoose = require('mongoose');
const Payment = require('../src/models/Payment');

const uri = process.env.MONGO_URI;

// The Payment receipts live in the "test" database, not "ketabot".
const uriWithTestDb = uri
  .replace(/\/ketabot\?/, '/test?')
  .replace(/\/ketabot$/, '/test');

const secret = process.env.RECEIPT_ACCESS_KEY || '';
const baseUrl = process.env.WEBHOOK_URL || 'http://localhost:' + (process.env.PORT || 4040);

function tokenFor(orderRef) {
  return crypto.createHmac('sha256', secret).update(orderRef).digest('hex').substring(0, 32);
}

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uriWithTestDb);
  console.log('Connected to DB: ' + mongoose.connection.name);

  const payments = await Payment.find({ receiptImage: { $exists: true, $ne: null } }).lean();
  console.log('Found ' + payments.length + ' payments with receipts.');

  let updated = 0;
  for (const p of payments) {
    if (!p.orderRef) continue;
    const url = `${baseUrl}/receipt/${encodeURIComponent(p.orderRef)}?token=${tokenFor(p.orderRef)}`;
    await Payment.updateOne({ _id: p._id }, { $set: { receiptViewUrl: url } });
    console.log('OK: ' + p.orderRef + ' -> ' + url);
    updated++;
  }

  console.log('Done. Updated ' + updated + ' payments.');
  await mongoose.disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });