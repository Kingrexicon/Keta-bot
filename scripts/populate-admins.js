require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const client = mongoose.connection.getClient();
  const db = client.db('ketabot');

  const adminIds = (process.env.ADMIN_IDS || '')
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(id => !isNaN(id));

  console.log(`Found ${adminIds.length} admin IDs in ADMIN_IDS env:`);
  adminIds.forEach(id => console.log(`  - ${id}`));

  const adminCol = db.collection('admins');
  const usersCol = db.collection('users');

  for (const telegramId of adminIds) {
    // Try to find a matching user record to use their name/username
    let name = '';
    const user = await usersCol.findOne({ telegramId });
    if (user) {
      const parts = [user.firstName, user.surname, user.otherNames].filter(Boolean);
      name = parts.join(' ') || user.username || '';
    }

    const result = await adminCol.updateOne(
      { telegramId },
      {
        $set: {
          telegramId,
          name,
          active: true,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    const action = result.upsertedCount > 0 ? 'INSERTED' : 'UPDATED';
    console.log(`  ${action} admin ${telegramId} (${name || 'no name found'})`);
  }

  const total = await adminCol.countDocuments({ active: true });
  console.log(`\nActive admins in 'ketabot.admins': ${total}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });