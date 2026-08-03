require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const { connectDB, disconnectDB } = require('../src/config/database');
const Rate = require('../src/models/Rate');
const { MIN_FIAT_AMOUNT, MIN_RATE_BY_COIN, MIN_EFFECTIVE_NGN_USD_RATE, MIN_BUY_USD } = require('../src/utils/constants');

async function checkRates() {
  try {
    await connectDB();

    const allRates = await Rate.find({});
    console.log('=== CURRENT RATES IN DATABASE ===\n');
    if (allRates.length === 0) {
      console.log('  (NO RATES FOUND — this is the problem!)');
    } else {
      for (const r of allRates) {
        console.log(`  ${r.coin}:`);
        console.log(`    buyRate:  ₦${r.buyRate.toLocaleString()}`);
        console.log(`    sellRate: ₦${r.sellRate.toLocaleString()}`);
        console.log(`    usdPrice: $${r.usdPrice}`);
        console.log(`    isManual: ${r.isManual}`);
        console.log(`    updatedAt: ${r.updatedAt}`);
        console.log('');
      }
    }

    console.log('=== SAFETY GUARD THRESHOLDS ===\n');
    console.log(`  MIN_FIAT_AMOUNT: ₦${MIN_FIAT_AMOUNT}`);
    console.log(`  MIN_EFFECTIVE_NGN_USD_RATE: ₦${MIN_EFFECTIVE_NGN_USD_RATE}`);
    console.log(`  MIN_BUY_USD: $${MIN_BUY_USD}`);
    console.log(`  MIN_RATE_BY_COIN:`, MIN_RATE_BY_COIN);
    console.log('');

    console.log('=== SIMULATING $20 BUY FOR EACH COIN ===\n');
    const usdtRate = allRates.find(r => r.coin === 'USDT');
    
    if (!usdtRate) {
      console.log('  ❌ USDT rate NOT FOUND — cannot compute naira amount!');
      console.log('  This is why the guard triggers: no USDT rate = no naira anchor.');
    } else {
      const usdAmount = 20;
      const fiatAmount = Math.floor(usdAmount * usdtRate.buyRate);
      const effectiveNgnUsdRate = usdAmount > 0 ? fiatAmount / usdAmount : 0;
      
      console.log(`  USDT buyRate: ₦${usdtRate.buyRate.toLocaleString()}`);
      console.log(`  $20 → fiatAmount: ₦${fiatAmount.toLocaleString()}`);
      console.log(`  effective NGN/USD: ₦${effectiveNgnUsdRate.toFixed(2)}`);
      console.log('');
      
      // Check each guard
      console.log('  Guard checks for $20 buy:');
      console.log(`    1. fiatAmount >= MIN_FIAT_AMOUNT (₦${MIN_FIAT_AMOUNT}): ${fiatAmount >= MIN_FIAT_AMOUNT ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`    2. effectiveNgnUsdRate >= MIN_EFFECTIVE_NGN_USD_RATE (₦${MIN_EFFECTIVE_NGN_USD_RATE}): ${effectiveNgnUsdRate >= MIN_EFFECTIVE_NGN_USD_RATE ? '✅ PASS' : '❌ FAIL'}`);
      console.log('');
      
      for (const coin of ['ETH', 'USDT', 'USDC']) {
        const rate = allRates.find(r => r.coin === coin);
        if (!rate) {
          console.log(`  ${coin}: ❌ RATE NOT FOUND`);
          continue;
        }
        const minRate = MIN_RATE_BY_COIN[coin];
        const passesRateGuard = !minRate || rate.buyRate >= minRate;
        const cryptoAmount = Math.floor((fiatAmount / rate.buyRate) * 10000) / 10000;
        console.log(`  ${coin}: buyRate ₦${rate.buyRate.toLocaleString()}, min ₦${minRate.toLocaleString()} → ${passesRateGuard ? '✅ PASS' : '❌ FAIL'} | crypto: ${cryptoAmount}`);
      }
    }

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Check failed:', error.message);
    try { await disconnectDB(); } catch (e) {}
    process.exit(1);
  }
}

checkRates();