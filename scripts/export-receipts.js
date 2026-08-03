/**
 * Export Receipt Images from MongoDB
 * Usage:
 *   node scripts/export-receipts.js [orderRef]
 */
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Payment = require('../src/models/Payment');

const args = process.argv.slice(2);
const orderRef = args.find(a => !a.startsWith('-'));
const uri = process.env.MONGO_URI;

async function main() {
  const outDir = path.join(process.cwd(), 'receipts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected.');

  const q = { receiptImage: { $exists: true, $ne: null } };
  if (orderRef) q.orderRef = orderRef;

  const payments = await Payment.find(q).lean();
  console.log('Found ' + payments.length + ' receipts.');
  if (!payments.length) { await mongoose.disconnect(); return; }

  let ok = 0;
  for (const p of payments) {
    const ref = p.orderRef || 'unknown';
    const img = p.receiptImage;
    if (!img) continue;
    const buf = Buffer.isBuffer(img) ? img : Buffer.from(img.buffer || img);
    if (!buf.length) continue;
    const ext = (p.receiptMimeType || '').includes('png') ? 'png' : 'jpg';
    const fname = 'receipt_' + ref + '.' + ext;
    fs.writeFileSync(path.join(outDir, fname), buf);
    console.log('OK: ' + ref + ' -> ' + fname);
    ok++;
  }

  console.log('Done. Exported ' + ok + ' files to ' + outDir);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });