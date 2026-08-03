/**
 * Export Receipt Images from MongoDB
 * Usage:
 *   node scripts/export-receipts.js [orderRef]
 */
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Payment = require('../src/models/Payment');

const args = process.argv.slice(2);
const orderRef = args.find(a => !a.startsWith('-') && a !== '--force');
const force = args.includes('--force');
const uri = process.env.MONGO_URI;

// The Payment receipts live in the "test" database, not "ketabot".
const uriWithTestDb = uri
  .replace(/\/ketabot\?/, '/test?')
  .replace(/\/ketabot$/, '/test');

async function main() {
  const outDir = path.join(process.cwd(), 'receipts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uriWithTestDb);
  console.log('Connected to DB: ' + mongoose.connection.name);

  const q = { receiptImage: { $exists: true, $ne: null } };
  if (orderRef) q.orderRef = orderRef;

  const payments = await Payment.find(q).lean();
  console.log('Found ' + payments.length + ' receipts.');
  if (!payments.length) { await mongoose.disconnect(); return; }

  let ok = 0;
  let skipped = 0;
  for (const p of payments) {
    const ref = p.orderRef || 'unknown';
    const img = p.receiptImage;
    if (!img) continue;
    const buf = Buffer.isBuffer(img) ? img : Buffer.from(img.buffer || img);
    if (!buf.length) continue;
    const ext = (p.receiptMimeType || '').includes('png') ? 'png' : 'jpg';
    const fname = 'receipt_' + ref + '.' + ext;
    const filePath = path.join(outDir, fname);

    // Skip if the file already exists (unless --force is used)
    if (!force && fs.existsSync(filePath)) {
      console.log('SKIP: ' + ref + ' already exists (' + fname + ')');
      skipped++;
      continue;
    }

    fs.writeFileSync(filePath, buf);
    console.log('OK: ' + ref + ' -> ' + fname);
    ok++;
  }

  console.log('Done. Exported ' + ok + ' new, skipped ' + skipped + ' existing. Files in ' + outDir);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });