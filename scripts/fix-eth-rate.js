require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const { connectDB, disconnectDB } = require('../src/config/database');
const Rate = require('../src/models/Rate');
const { fetchLivePrices } = require('../src/services/rateApiService');

/**
 * One-off fix: correct missing/inconsistent rates in the DB.
 *
 * Design: USD → USDT/NGN → coin/NGN
 * The naira value of every order is anchored to the USDT/NGN rate
 * (the market's dollar price), then converted to the selected coin
 * via that coin's own NGN rate. This guarantees $X always equals the
 * correct naira amount, and coin rates stay internally consistent.
 *
 * Fetches live prices from Binance and writes buy rates (market + 2% spread)
 * for USDT, USDC and ETH, clearing the isManual flag so scheduled refreshes
 * keep them accurate. If Binance is unreachable, falls back to consistent
 * defaults derived from the USDT anchor.
 */
async function fixRates() {
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

    // Try to fetch live prices from Binance
    let prices = null;
    try {
      console.log('\nFetching live prices from Binance...');
      prices = await fetchLivePrices();
    } catch (err) {
      console.log('⚠️ Binance unreachable from this machine:', err.message);
    }

    const spread = 0.02; // 2% spread (same as rateApiService)

    // Define the rates to write: USDT → USDC → ETH, all consistent with the
    // USDT/NGN anchor. When live data is available it's used; otherwise
    // defaults derived from USDT/NGN ₦1,630 × ETH/USD $3,400.
    const ratesToSet = {};

    if (prices) {
      // Live prices path (Binance reachable)
      for (const [coin, data] of Object.entries(prices)) {
        ratesToSet[coin] = {
          buyRate: Math.floor(data.ngn * (1 + spread)),
          sellRate: Math.floor(data.ngn * (1 - spread)),
          usdPrice: data.usd
        };
      }
      console.log('Using live Binance prices.');
    } else {
      // Consistent fallback defaults (Binance unreachable from this machine)
      const usdtNgn = 1630;               // USDT/NGN market anchor
      const ethUsd = 3400;                // ETH/USD market price
      ratesToSet.USDT = { buyRate: Math.floor(usdtNgn * (1 + spread)), sellRate: Math.floor(usdtNgn * (1 - spread)), usdPrice: 1 };
      ratesToSet.USDC = { buyRate: Math.floor(usdtNgn * (1 + spread)), sellRate: Math.floor(usdtNgn * (1 - spread)), usdPrice: 1 };
      ratesToSet.ETH = {
        buyRate: Math.floor(usdtNgn * ethUsd * (1 + spread)),
        sellRate: Math.floor(usdtNgn * ethUsd * (1 - spread)),
        usdPrice: ethUsd
      };
      console.log('Using consistent fallback defaults (Binance unreachable).');
    }

    console.log('\nWriting rates:');
    for (const [coin, r] of Object.entries(ratesToSet)) {
      const updated = await Rate.findOneAndUpdate(
        { coin },
        {
          buyRate: r.buyRate,
          sellRate: r.sellRate,
          usdPrice: r.usdPrice,
          isManual: false,
          updatedAt: new Date()
        },
        { upsert: true, returnDocument: 'after' }
      );
      console.log(`  ✅ ${coin}: buy ₦${updated.buyRate.toLocaleString()}, sell ₦${updated.sellRate.toLocaleString()}, USD $${updated.usdPrice}`);
    }

    await disconnectDB();
    console.log('\nDone.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    try { await disconnectDB(); } catch (e) {}
    process.exit(1);
  }
}

fixRates();