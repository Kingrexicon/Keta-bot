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
      await Rate.findOneAndUpdate(
        { coin },
        { buyRate: rates.buyRate, sellRate: rates.sellRate, updatedAt: new Date() },
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
        ETH: { buyRate: 2500000, sellRate: 2400000 },
        USDT: { buyRate: 1630, sellRate: 1590 },
        USDC: { buyRate: 1630, sellRate: 1590 }
      };
      const d = defaults[coin] || { buyRate: 1630, sellRate: 1590 };
      await Rate.create({
        coin,
        buyRate: d.buyRate,
        sellRate: d.sellRate
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
    { buyRate, sellRate, updatedAt: new Date() },
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
