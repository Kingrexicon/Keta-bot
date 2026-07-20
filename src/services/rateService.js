const Rate = require('../models/Rate');
const { COINS } = require('../utils/constants');
const { getAllLiveRates } = require('./rateApiService');

/**
 * Refresh all rates from the live API and store them in DB
 */
async function refreshRatesFromApi() {
  try {
    const liveRates = await getAllLiveRates();
    for (const [coin, rates] of Object.entries(liveRates)) {
      const existingRate = await Rate.findOne({ coin });

      // Preserve a price explicitly set by an administrator.
      if (existingRate?.isManual) {
        continue;
      }

      await Rate.findOneAndUpdate(
        { coin },
        {
          buyRate: rates.buyRate,
          sellRate: rates.sellRate,
          usdPrice: rates.usdPrice,
          isManual: false,
          updatedAt: new Date()
        },
        { upsert: true }
      );
    }
    console.log(`✅ Rates refreshed from API (${Object.keys(liveRates).length} coins)`);
    return liveRates;
  } catch (error) {
    console.error('⚠️ Failed to refresh rates from API:', error.message);
    return null;
  }
}

async function initializeRates() {
  // Try API first, fall back to defaults
  const apiSuccess = await refreshRatesFromApi();
  if (apiSuccess) return;

  // Fallback: create default rates
  for (const coin of Object.values(COINS)) {
    const existing = await Rate.findOne({ coin });
    if (!existing) {
      const defaults = {
        ETH: { buyRate: 2500000, sellRate: 2400000, usdPrice: 3400 },
        USDT: { buyRate: 1630, sellRate: 1590, usdPrice: 1 },
        USDC: { buyRate: 1630, sellRate: 1590, usdPrice: 1 }
      };
      const d = defaults[coin] || { buyRate: 1630, sellRate: 1590, usdPrice: 1 };
      await Rate.create({
        coin,
        buyRate: d.buyRate,
        sellRate: d.sellRate,
        usdPrice: d.usdPrice
      });
    }
  }
  console.log('✅ Default rates initialized (API unavailable)');
}

async function getRate(coin) {
  return Rate.findOne({ coin });
}

async function setRate(coin, buyRate, sellRate) {
  return Rate.findOneAndUpdate(
    { coin },
    { buyRate, sellRate, isManual: true, updatedAt: new Date() },
    { returnDocument: 'after', upsert: true }
  );
}

async function getAllRates() {
  return Rate.find({});
}

module.exports = {
  initializeRates,
  getRate,
  setRate,
  getAllRates,
  refreshRatesFromApi
};
