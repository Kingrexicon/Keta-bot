const https = require('https');

/**
 * Binance symbol names mapped to our coin symbols
 * Binance has NGN pairs for USDT and ETH
 */
const BINANCE_SYMBOLS = {
  USDT: 'USDTNGN',
  ETH: 'ETHNGN'
};

/**
 * Fetch a URL via HTTPS GET
 */
function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'KetaBot-Telegram/1.0'
      },
      timeout: timeoutMs
    };
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

/**
 * Fetch live NGN + USD prices for all supported coins from Binance
 * Binance has no rate limiting on the public ticker endpoint
 * @returns {Promise<Object>} e.g. { ETH: { ngn: 2850000, usd: 3400 }, USDT: { ngn: 1630, usd: 1 }, USDC: { ngn: 1630, usd: 1 } }
 */
async function fetchLivePrices() {
  // Fetch all Binance tickers in one call
  const url = 'https://api.binance.com/api/v3/ticker/price';
  const allTickers = await fetchJson(url);

  // Safety check: Binance should return an array, but handle non-array responses
  if (!Array.isArray(allTickers)) {
    throw new Error('Binance API returned unexpected response format');
  }

  // Build a lookup map from the response array
  const priceMap = {};
  for (const ticker of allTickers) {
    priceMap[ticker.symbol] = parseFloat(ticker.price);
  }

  const prices = {};

  // Get USDT/NGN directly from Binance
  if (priceMap['USDTNGN']) {
    prices.USDT = { ngn: priceMap['USDTNGN'], usd: 1 };
  }

  // Get ETH/NGN and ETH/USDT from Binance
  if (priceMap['ETHNGN'] && priceMap['ETHUSDT']) {
    prices.ETH = { ngn: priceMap['ETHNGN'], usd: priceMap['ETHUSDT'] };
  }

  // Get USDC via USDC/USDT pair (should be ~1.0)
  if (priceMap['USDCUSDT'] && prices.USDT) {
    const usdcUsd = priceMap['USDCUSDT'];
    prices.USDC = { ngn: usdcUsd * prices.USDT.ngn, usd: usdcUsd };
  } else if (prices.USDT) {
    // Fallback: USDC = USDT (both $1 stablecoins)
    prices.USDC = { ngn: prices.USDT.ngn, usd: 1 };
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
  for (const [coin, data] of Object.entries(prices)) {
    rates[coin] = {
      buyRate: Math.floor(data.ngn * (1 + spread)),
      sellRate: Math.floor(data.ngn * (1 - spread)),
      usdPrice: data.usd
    };
  }

  return rates;
}

module.exports = {
  fetchLivePrices,
  getAllLiveRates
};