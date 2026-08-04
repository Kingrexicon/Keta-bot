require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const mongoose = require('mongoose');

const SOURCE_DB = 'test';
const TARGET_DB = 'ketabot';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const client = mongoose.connection.getClient();
  const source = client.db(SOURCE_DB);
  const target = client.db(TARGET_DB);

  const cols = await source.listCollections().toArray();
  console.log(`Found ${cols.length} collections in '${SOURCE_DB}':`);
  for (const c of cols) console.log(`  - ${c.name}`);

  for (const c of cols) {
    const name = c.name;
    const srcCount = await source.collection(name).countDocuments();
    console.log(`\n--- ${name} (${srcCount} docs in source) ---`);

    // Drop target collection to avoid _id conflicts (ketabot is essentially empty)
    try {
      await target.collection(name).drop();
      console.log(`  Dropped existing '${TARGET_DB}.${name}'`);
    } catch (e) {
      // Collection doesn't exist yet — fine
    }

    if (srcCount === 0) {
      console.log('  Source empty, nothing to copy.');
      continue;
    }

    // Stream documents in batches to avoid memory issues
    const cursor = source.collection(name).find({});
    let batch = [];
    let copied = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      batch.push(doc);
      if (batch.length >= 500) {
        await target.collection(name).insertMany(batch, { ordered: false });
        copied += batch.length;
        batch = [];
        console.log(`  Copied ${copied}/${srcCount}...`);
      }
    }
    if (batch.length > 0) {
      await target.collection(name).insertMany(batch, { ordered: false });
      copied += batch.length;
    }

    const tgtCount = await target.collection(name).countDocuments();
    console.log(`  ✅ Copied ${copied} docs. Target now has ${tgtCount}.`);
  }

  console.log('\n=== Migration complete ===');
  await mongoose.disconnect();
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });