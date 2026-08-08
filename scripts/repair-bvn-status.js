/**
 * One-off repair script: fix users where BVN verification completed
 * (bvnVerifiedAt is set) but the bvnVerified boolean was never persisted.
 *
 * This happens when older deployed code set the timestamp without the boolean.
 * Run: node scripts/repair-bvn-status.js
 */
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
// Set public DNS resolvers — required on some networks for MongoDB Atlas SRV lookups
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const { connectDB, disconnectDB } = require('../src/config/database');
const User = require('../src/models/User');

async function repair() {
  await connectDB();

  // Find users with proof of verification (timestamp) but boolean not true
  const users = await User.find({
    bvnVerifiedAt: { $ne: null },
    $or: [
      { bvnVerified: { $ne: true } },
      { bvnVerified: { $exists: false } }
    ]
  });

  console.log(`Found ${users.length} user(s) with bvnVerifiedAt set but bvnVerified not true`);

  let fixed = 0;
  for (const user of users) {
    user.bvnVerified = true;
    await user.save();
    fixed++;
    console.log(`✅ Fixed telegramId ${user.telegramId} (${user.firstName} ${user.surname})`);
  }

  console.log(`\nDone. Repaired ${fixed} user(s).`);
  await disconnectDB();
  process.exit(0);
}

repair().catch(async (e) => {
  console.error('Repair failed:', e.message);
  await disconnectDB();
  process.exit(1);
});