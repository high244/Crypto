// Hyperliquid's public info API is designed to be called from browser dApps.
const INFO_URL = import.meta.env?.DEV
  ? '/hyperliquid-api/info'
  : 'https://api.hyperliquid.xyz/info';

const INTERVAL_MS = {
  '1m': 60_000,
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '2h': 2 * 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '8h': 8 * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
  '1M': 30 * 24 * 60 * 60_000,
};

async function postInfo(payload, { signal } = {}) {
  const response = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid HTTP ${response.status}`);
  }

  return response.json();
}

export function toHyperliquidInterval(timeframe) {
  return timeframe === 'all' ? '1d' : timeframe;
}

/**
 * Fetch recent perpetual candles. Hyperliquid serves the most recent 5,000
 * candles, so ALL intentionally asks for that maximum on 1D candles.
 */
export async function fetchHyperliquidCandles(coin, timeframe, options = {}) {
  const interval = toHyperliquidInterval(timeframe);
  const intervalMs = INTERVAL_MS[interval];
  if (!intervalMs) throw new Error(`Hyperliquid tidak mendukung timeframe ${timeframe}.`);

  const endTime = Number(options.endTime) || Date.now();
  const candleCount = Number(options.limit) || (timeframe === 'all' ? 5000 : 500);
  const startTime = Number(options.startTime) || (endTime - intervalMs * candleCount);
  const rows = await postInfo({
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime },
  }, options);

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Hyperliquid: candle tidak tersedia untuk pair ini.');
  }

  return rows.map((row) => ({
    time: Math.floor(Number(row.t) / 1000),
    open: Number(row.o),
    high: Number(row.h),
    low: Number(row.l),
    close: Number(row.c),
    volume: Number(row.v),
  }));
}

/** Return mark price, funding rate, and open interest for one Hyperliquid perp. */
export async function fetchHyperliquidAssetContext(coin, options = {}) {
  const payload = await postInfo({ type: 'metaAndAssetCtxs' }, options);
  const meta = payload?.[0];
  const contexts = payload?.[1];
  const index = meta?.universe?.findIndex(
    (asset) => asset.name?.toUpperCase() === coin.toUpperCase()
  );

  if (!Number.isInteger(index) || index < 0 || !contexts?.[index]) {
    throw new Error(`Hyperliquid: perpetual ${coin} tidak ditemukan.`);
  }

  return { asset: meta.universe[index], context: contexts[index] };
}

/**
 * Fetch all tradable perpetual and spot symbols on Hyperliquid for autocomplete.
 */
let _hlSymbolsCache = null;
export async function fetchHyperliquidSymbols(options = {}) {
  if (_hlSymbolsCache) return _hlSymbolsCache;
  try {
    const payload = await postInfo({ type: 'meta' }, options);
    const universe = payload?.universe || [];
    _hlSymbolsCache = universe
      .filter((asset) => !asset.isDelisted && asset.name)
      .map((asset) => ({
        symbol: `${asset.name.toUpperCase()}USDT`,
        baseAsset: asset.name.toUpperCase(),
        quoteAsset: 'USD',
        maxLeverage: asset.maxLeverage,
        source: 'hyperliquid',
      }));
    return _hlSymbolsCache;
  } catch (error) {
    console.warn('Hyperliquid symbols fetch failed:', error);
    return [];
  }
}

