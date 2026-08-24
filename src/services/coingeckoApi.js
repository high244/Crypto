// CoinGecko API service — local development uses Vite's proxy.
const BASE = import.meta.env?.DEV
  ? '/coingecko-api/api/v3'
  : 'https://api.coingecko.com/api/v3';

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
 * Search CoinGecko's ranked index first, so popular assets appear immediately.
 * Returns [{id, symbol, name}, ...]
 */
export async function searchCoins(query, { signal } = {}) {
  const res = await fetch(`${BASE}/search?query=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`CoinGecko search HTTP ${res.status}`);
  const data = await res.json();
  return data.coins || [];
}

/**
 * Search the full CoinGecko ID map to include every matching catalog entry.
 */
export async function searchAllCoins(query) {
  const list = await getCoinList();
  const q = query.toLowerCase();
  return list
    .filter((c) =>
      c.symbol.includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.id.includes(q)
    );
}

/**
 * Fetch OHLC candlestick data from CoinGecko.
 * @param {string} coinId e.g., "hyperliquid"
 * @param {number} days 1, 7, 14, 30, 90, 180, 365
 * @returns OHLC data formatted for lightweight-charts
 */
export async function fetchOHLC(coinId, days = 30, { signal } = {}) {
  const res = await fetch(
    `${BASE}/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${days}`,
    { signal }
  );
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
export async function fetchCoinMarketData(coinId, { signal } = {}) {
  const params = new URLSearchParams({
    vs_currency: 'usd',
    ids: coinId,
    price_change_percentage: '24h',
  });
  const res = await fetch(`${BASE}/coins/markets?${params}`, { signal });
  if (!res.ok) throw new Error(`CoinGecko coins/markets HTTP ${res.status}`);
  const [data] = await res.json();
  if (!data) throw new Error('CoinGecko: coin tidak ditemukan.');

  return {
    symbol: data.symbol.toUpperCase() + 'USD',
    close: data.current_price ?? 0,
    open: data.current_price && data.price_change_24h
      ? data.current_price - data.price_change_24h
      : data.current_price ?? 0,
    high: data.high_24h ?? null,
    low: data.low_24h ?? null,
    volume: data.total_volume ?? null,
    quoteVolume: data.total_volume ?? null,
    change: data.price_change_24h ?? 0,
    changePct: data.price_change_percentage_24h ?? 0,
  };
}

const COMMON_COIN_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  UNI: 'uniswap',
  LTC: 'litecoin',
  ATOM: 'cosmos',
  ARB: 'arbitrum',
  OP: 'optimism',
  APT: 'aptos',
  SUI: 'sui',
  PEPE: 'pepe',
  HYPE: 'hyperliquid',
};

function baseAssetFromSymbol(symbol) {
  const normalized = symbol.toUpperCase().replace(/[\s/_-]/g, '');
  const quote = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'USD', 'BTC', 'ETH']
    .find((item) => normalized.endsWith(item));
  return quote ? normalized.slice(0, -quote.length) : normalized;
}

/** Resolve a Binance-like pair to a CoinGecko ID without downloading the full catalog. */
export async function resolveCoinGeckoId(symbol, { signal } = {}) {
  const base = baseAssetFromSymbol(symbol);
  if (COMMON_COIN_IDS[base]) return COMMON_COIN_IDS[base];

  const results = await searchCoins(base, { signal });
  const exact = results.find((coin) => coin.symbol?.toUpperCase() === base);
  return (exact || results[0])?.id || null;
}

function normalizeDerivativeSymbol(symbol) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Get the best available perpetual ticker from CoinGecko's cross-exchange
 * derivatives feed. CoinGecko reports funding as percentage points, so this
 * adapter converts it to the decimal convention used by Binance/Hyperliquid.
 */
export async function fetchDerivativeTicker(symbol, { signal } = {}) {
  const res = await fetch(`${BASE}/derivatives`, { signal });
  if (!res.ok) throw new Error(`CoinGecko derivatives HTTP ${res.status}`);
  const rows = await res.json();
  const target = normalizeDerivativeSymbol(symbol);
  const base = baseAssetFromSymbol(symbol);

  const perpetuals = rows.filter((row) => row.contract_type === 'perpetual');
  const match = perpetuals.find((row) => normalizeDerivativeSymbol(row.symbol) === target)
    || perpetuals.find((row) => (
      row.index_id?.toUpperCase() === base
      && normalizeDerivativeSymbol(row.symbol).includes(base)
      && normalizeDerivativeSymbol(row.symbol).includes('USDT')
    ))
    || perpetuals.find((row) => row.index_id?.toUpperCase() === base);

  if (!match) throw new Error('CoinGecko: perpetual tidak ditemukan.');

  const fundingPercentage = Number(match.funding_rate);
  return {
    market: match.market,
    price: Number(match.price),
    changePct: Number(match.price_percentage_change_24h),
    fundingRate: Number.isFinite(fundingPercentage) ? fundingPercentage / 100 : null,
    openInterest: Number(match.open_interest),
    volume: Number(match.volume_24h),
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
    all: 'max',
  };
  return map[tf] || 30;
}
