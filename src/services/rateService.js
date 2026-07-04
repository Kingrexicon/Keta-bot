const Rate = require('../models/Rate');
const { COINS } = require('../utils/constants');

async function initializeRates() {
  for (const coin of Object.values(COINS)) {
    const existing = await Rate.findOne({ coin });
    if (!existing) {
      await Rate.create({
        coin,
        buyRate: 1630,
        sellRate: 1590
      });
    }
  }
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
  getAllRates
};