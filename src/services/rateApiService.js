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
/**
 * Fetch a single Binance ticker price
 */
async function fetchTicker(symbol, timeoutMs = 5000) {
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
  const data = await fetchJson(url, timeoutMs);
  if (data && data.price) {
    return parseFloat(data.price);
  }
  return null;
}

async function fetchLivePrices() {
  // Fetch each needed price individually (most reliable approach)
  let usdtngn = null, ethusdt = null, ethngn = null, usdcusdt = null;

  try { usdtngn = await fetchTicker('USDTNGN'); } catch (e) {}
  try { ethusdt = await fetchTicker('ETHUSDT'); } catch (e) {}
  try { ethngn = await fetchTicker('ETHNGN'); } catch (e) {}
  try { usdcusdt = await fetchTicker('USDCUSDT'); } catch (e) {}

  const prices = {};

  if (usdtngn) {
    prices.USDT = { ngn: usdtngn, usd: 1 };
  }

  if (ethngn && ethusdt) {
    prices.ETH = { ngn: ethngn, usd: ethusdt };
  }

  if (usdcusdt && usdtngn) {
    prices.USDC = { ngn: usdcusdt * usdtngn, usd: usdcusdt };
  } else if (usdtngn) {
    prices.USDC = { ngn: usdtngn, usd: 1 };
  }

  if (Object.keys(prices).length === 0) {
    throw new Error('Could not fetch any prices from Binance');
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