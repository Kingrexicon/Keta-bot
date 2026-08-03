require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();
  console.log('Databases:');
  for (const db of dbs.databases) {
    console.log(' - ' + db.name + ' (' + (db.sizeOnDisk / 1024 / 1024).toFixed(1) + ' MB)');
  }
  for (const db of dbs.databases) {
    if (db.name === 'admin' || db.name === 'local' || db.name === 'config') continue;
    const conn = mongoose.connection.getClient().db(db.name);
    const cols = await conn.listCollections().toArray();
    if (cols.some(c => c.name === 'payments')) {
      const count = await conn.collection('payments').countDocuments();
      console.log('   -> ' + db.name + '/payments has ' + count + ' docs');
    }
  }
  await mongoose.disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });