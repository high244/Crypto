// Binance REST API service — all requests go through Vite proxy to bypass CORS
const BASE = '/binance-api/api/v3';

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
 * Fetch all exchange symbols (for search autocomplete).
 * Uses lightweight ticker/price endpoint (~156KB) instead of exchangeInfo (~17MB).
 * Caches result in memory.
 */
let _symbolsCache = null;
const QUOTE_ASSETS = ['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB'];

function parseSymbol(symbol) {
  for (const quote of QUOTE_ASSETS) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return { symbol, baseAsset: symbol.slice(0, -quote.length), quoteAsset: quote };
    }
  }
  return null;
}

export async function fetchSymbols() {
  if (_symbolsCache) return _symbolsCache;
  const url = `${BASE}/ticker/price`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ticker/price HTTP ${res.status}`);
  const data = await res.json();
  _symbolsCache = data
    .map((t) => parseSymbol(t.symbol))
    .filter(Boolean)
    .sort((a, b) => {
      // Prioritize USDT pairs, then alphabetical
      const aUsdt = a.quoteAsset === 'USDT' ? 0 : 1;
      const bUsdt = b.quoteAsset === 'USDT' ? 0 : 1;
      if (aUsdt !== bUsdt) return aUsdt - bUsdt;
      return a.baseAsset.localeCompare(b.baseAsset);
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
