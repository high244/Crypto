// Binance REST API service — local development uses Vite's proxy.
const BASE = import.meta.env.DEV
  ? '/binance-api/api/v3'
  : 'https://data-api.binance.vision/api/v3';

/**
 * Fetch historical klines (candlestick data).
 * @param {string} symbol e.g. "BTCUSDT"
 * @param {string} interval e.g. "1m","5m","15m","1h","4h","1d","1w"
 * @param {number} limit max 1000
 * @returns {Promise<Array<{time:number, open:number, high:number, low:number, close:number, volume:number}>>}
 */
export async function fetchKlines(symbol, interval, limit = 500) {
  const url = `${BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);
  const data = await res.json();
  return data.map((k) => ({
    time: Math.floor(k[0] / 1000), // lightweight-charts uses unix seconds
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

/**
 * Fetch 24h ticker stats for a symbol.
 */
export async function fetchTicker24h(symbol) {
  const url = `${BASE}/ticker/24hr?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ticker HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch order book depth.
 */
export async function fetchDepth(symbol, limit = 20) {
  const url = `${BASE}/depth?symbol=${symbol.toUpperCase()}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance depth HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch every actively traded Binance Spot pair for search autocomplete.
 * exchangeInfo supplies the real base and quote assets, so pairs such as
 * BTCIDR and MANTAIDR are included too. The result is cached in memory.
 */
let _symbolsCache = null;

export async function fetchSymbols() {
  if (_symbolsCache) return _symbolsCache;
  const url = `${BASE}/exchangeInfo`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance exchangeInfo HTTP ${res.status}`);
  const data = await res.json();
  _symbolsCache = data.symbols
    .filter((symbol) => symbol.status === 'TRADING')
    .map(({ symbol, baseAsset, quoteAsset }) => ({ symbol, baseAsset, quoteAsset }))
    .sort((a, b) => {
      const baseCompare = a.baseAsset.localeCompare(b.baseAsset);
      return baseCompare || a.quoteAsset.localeCompare(b.quoteAsset);
    });
  return _symbolsCache;
}

/**
 * Fetch recent trades
 */
export async function fetchRecentTrades(symbol, limit = 50) {
  const url = `${BASE}/trades?symbol=${symbol.toUpperCase()}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance trades HTTP ${res.status}`);
  return res.json();
}
