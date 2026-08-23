// CoinGecko API service — fallback for coins not on Binance
const BASE = '/coingecko-api/api/v3';

// Cache coin list for ID lookups
let _coinListCache = null;
let _coinListPromise = null;

/**
 * Fetch full coin list for symbol→ID mapping.
 * CoinGecko uses slugs (e.g., "hyperliquid") not ticker symbols.
 */
async function getCoinList() {
  if (_coinListCache) return _coinListCache;
  if (_coinListPromise) return _coinListPromise;

  _coinListPromise = (async () => {
    const res = await fetch(`${BASE}/coins/list`);
    if (!res.ok) throw new Error(`CoinGecko coins/list HTTP ${res.status}`);
    const data = await res.json();
    _coinListCache = data; // [{id, symbol, name}, ...]
    return _coinListCache;
  })();

  return _coinListPromise;
}

/**
 * Find CoinGecko coin ID from a ticker symbol (e.g., "HYPE" → "hyperliquid")
 */
export async function findCoinId(symbol) {
  const list = await getCoinList();
  const sym = symbol.toLowerCase();
  // Exact match on symbol
  const matches = list.filter((c) => c.symbol === sym);
  if (matches.length === 1) return matches[0];
  // If multiple matches, prefer larger market cap coins (they come first usually)
  if (matches.length > 1) return matches[0];
  return null;
}

/**
 * Search coins by query string.
 * Returns [{id, symbol, name}, ...]
 */
export async function searchCoins(query) {
  const list = await getCoinList();
  const q = query.toLowerCase();
  return list
    .filter((c) =>
      c.symbol.includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.id.includes(q)
    )
    .slice(0, 50);
}

/**
 * Fetch OHLC candlestick data from CoinGecko.
 * @param {string} coinId e.g., "hyperliquid"
 * @param {number} days 1, 7, 14, 30, 90, 180, 365
 * @returns OHLC data formatted for lightweight-charts
 */
export async function fetchOHLC(coinId, days = 30) {
  const res = await fetch(`${BASE}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`);
  if (!res.ok) throw new Error(`CoinGecko OHLC HTTP ${res.status}`);
  const data = await res.json();
  // CoinGecko returns [[timestamp, open, high, low, close], ...]
  return data.map(([ts, open, high, low, close]) => ({
    time: Math.floor(ts / 1000),
    open,
    high,
    low,
    close,
    volume: 0, // CoinGecko OHLC doesn't include volume
  }));
}

/**
 * Fetch current price + market data for ticker bar.
 */
export async function fetchCoinMarketData(coinId) {
  const res = await fetch(
    `${BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
  );
  if (!res.ok) throw new Error(`CoinGecko coin data HTTP ${res.status}`);
  const data = await res.json();
  const md = data.market_data;
  return {
    symbol: data.symbol.toUpperCase() + 'USD',
    close: md.current_price?.usd || 0,
    open: md.current_price?.usd || 0,
    high: md.high_24h?.usd || 0,
    low: md.low_24h?.usd || 0,
    volume: md.total_volume?.usd || 0,
    quoteVolume: md.total_volume?.usd || 0,
    change: md.price_change_24h || 0,
    changePct: md.price_change_percentage_24h || 0,
  };
}

/**
 * Map timeframe to CoinGecko days parameter.
 */
export function timeframeToDays(tf) {
  const map = {
    '1m': 1,
    '5m': 1,
    '15m': 1,
    '1h': 7,
    '4h': 14,
    '1d': 30,
    '1w': 180,
  };
  return map[tf] || 30;
}
