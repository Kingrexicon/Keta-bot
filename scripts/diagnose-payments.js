require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const mongoose = require('mongoose');
const Payment = require('../src/models/Payment');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('DB:', mongoose.connection.name);
  console.log('Total payments:', await Payment.countDocuments());
  console.log('With receiptImage:', await Payment.countDocuments({ receiptImage: { $exists: true, $ne: null } }));
  const sample = await Payment.findOne().lean();
  console.log('Sample fields:', sample ? Object.keys(sample).join(', ') : 'none');
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name).join(', '));
  await mongoose.disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });