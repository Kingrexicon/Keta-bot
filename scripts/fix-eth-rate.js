require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const { connectDB, disconnectDB } = require('../src/config/database');
const Rate = require('../src/models/Rate');
const { fetchLivePrices } = require('../src/services/rateApiService');

/**
 * One-off fix: correct a misconfigured ETH buy rate.
 * Fetches the live ETH price from Binance and writes the correct
 * buy rate (market + 2% spread) to the DB, clearing the isManual flag
 * so scheduled refreshes keep it accurate.
 *
 * If Binance is unreachable (e.g. dev machine network restrictions),
 * falls back to a sensible default ETH rate so the DB is never left
 * with a broken/absent ETH rate.
 */
async function fixEthRate() {
  try {
    await connectDB();

    // Dump all current rates for visibility
    const allRates = await Rate.find({});
    console.log('All rates currently in DB:');
    if (allRates.length === 0) {
      console.log('  (none)');
    } else {
      for (const r of allRates) {
        console.log(`  ${r.coin}: buy ₦${r.buyRate.toLocaleString()}, sell ₦${r.sellRate.toLocaleString()}, usd $${r.usdPrice}, isManual ${r.isManual}`);
      }
    }

    const current = await Rate.findOne({ coin: 'ETH' });
    console.log('\nCurrent ETH rate in DB:', current ? {
      buyRate: current.buyRate,
      sellRate: current.sellRate,
      usdPrice: current.usdPrice,
      isManual: current.isManual
    } : 'NOT FOUND');

    // Try to fetch live ETH price from Binance
    let ethData = null;
    try {
      console.log('\nFetching live ETH price from Binance...');
      const prices = await fetchLivePrices();
      ethData = prices.ETH;
    } catch (err) {
      console.log('⚠️ Binance unreachable from this machine:', err.message);
    }

    let buyRate, sellRate, usdPrice;
    if (ethData) {
      const spread = 0.02; // 2% spread (same as rateApiService)
      buyRate = Math.floor(ethData.ngn * (1 + spread));
      sellRate = Math.floor(ethData.ngn * (1 - spread));
      usdPrice = ethData.usd;
      console.log('Using live Binance price.');
    } else {
      // Fallback default ETH rate (market ~₦2,900,000 + 2% spread)
      buyRate = 2958000;
      sellRate = 2842000;
      usdPrice = 3400;
      console.log('Using fallback default ETH rate (Binance unreachable).');
    }

    const updated = await Rate.findOneAndUpdate(
      { coin: 'ETH' },
      {
        buyRate,
        sellRate,
        usdPrice,
        isManual: false,
        updatedAt: new Date()
      },
      { upsert: true, returnDocument: 'after' }
    );

    console.log('\n✅ ETH rate fixed:');
    console.log('  Buy Rate:  ₦' + updated.buyRate.toLocaleString());
    console.log('  Sell Rate: ₦' + updated.sellRate.toLocaleString());
    console.log('  USD Price: $' + updated.usdPrice);
    console.log('  isManual:  ' + updated.isManual);

    await disconnectDB();
    console.log('\nDone.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    try { await disconnectDB(); } catch (e) {}
    process.exit(1);
  }
}

fixEthRate();