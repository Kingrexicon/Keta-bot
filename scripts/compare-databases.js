require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();

  console.log('=== Databases found ===');
  for (const db of dbs.databases) {
    console.log(` - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(1)} MB)`);
  }

  const targets = ['test', 'ketabot'];
  for (const dbName of targets) {
    const exists = dbs.databases.some(d => d.name === dbName);
    if (!exists) {
      console.log(`\n=== ${dbName} (does not exist) ===`);
      continue;
    }
    const conn = mongoose.connection.getClient().db(dbName);
    const cols = await conn.listCollections().toArray();
    console.log(`\n=== ${dbName} ===`);
    if (cols.length === 0) {
      console.log('  (no collections)');
      continue;
    }
    for (const c of cols) {
      const count = await conn.collection(c.name).countDocuments();
      console.log(`  - ${c.name}: ${count} docs`);
    }
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });