const https = require('https');

/**
 * CoinGecko coin IDs mapped to our coin symbols
 */
const COINGECKO_IDS = {
  SOL: 'solana',
  TRX: 'tron',
  USDT: 'tether',
  USDC: 'usd-coin'
};

/**
 * Fetch a URL via HTTPS GET
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'KetaBot-Telegram/1.0'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch live NGN prices for all supported coins from CoinGecko
 * @returns {Promise<Object>} e.g. { SOL: { ngn: 280000 }, TRX: { ngn: 150 }, USDT: { ngn: 1630 }, USDC: { ngn: 1630 } }
 */
async function fetchLivePrices() {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=ngn`;

  const data = await fetchJson(url);

  // Map CoinGecko response back to our coin symbols
  const reverseMap = {};
  for (const [ourCoin, geckoId] of Object.entries(COINGECKO_IDS)) {
    reverseMap[geckoId] = ourCoin;
  }

  const prices = {};
  for (const [geckoId, priceData] of Object.entries(data)) {
    const ourCoin = reverseMap[geckoId];
    if (ourCoin && priceData && priceData.ngn) {
      prices[ourCoin] = priceData.ngn;
    }
  }

  return prices;
}

/**
 * Get buy and sell rates for all supported coins
 * Buy rate = market price + 2% spread
 * Sell rate = market price - 2% spread
 * @returns {Promise<Object>} e.g. { SOL: { buyRate: 285600, sellRate: 274400 }, ... }
 */
async function getAllLiveRates() {
  const prices = await fetchLivePrices();
  const spread = 0.02; // 2% spread

  const rates = {};
  for (const [coin, price] of Object.entries(prices)) {
    rates[coin] = {
      buyRate: Math.floor(price * (1 + spread)),
      sellRate: Math.floor(price * (1 - spread))
    };
  }

  return rates;
}

module.exports = {
  fetchLivePrices,
  getAllLiveRates
};