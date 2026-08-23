// Binance USDⓈ-M Futures public REST API. No API key is required.
const BASE = import.meta.env.DEV
  ? '/binance-futures-api/fapi/v1'
  : 'https://fapi.binance.com/fapi/v1';

async function requestJson(path, { signal } = {}) {
  const response = await fetch(`${BASE}${path}`, { signal });
  if (!response.ok) {
    throw new Error(`Binance Futures HTTP ${response.status}`);
  }
  return response.json();
}

function normalizeKlines(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Binance Futures: candle tidak tersedia untuk pair ini.');
  }

  return rows.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));
}

export async function fetchFuturesKlines(symbol, interval, limit = 500, options = {}) {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    interval,
    limit: String(limit),
  });
  const rows = await requestJson(`/klines?${params}`, options);
  return normalizeKlines(rows);
}

/**
 * Fetch a bounded daily history for the ALL timeframe without defeating the
 * five-second source timeout that protects the fallback chain.
 */
export async function fetchAllFuturesKlines(symbol, interval = '1d', onProgress, { signal } = {}) {
  const batchSize = 1000;
  const all = [];
  let endTime;
  let batch = 0;

  while (batch < 5) {
    batch += 1;
    const params = new URLSearchParams({
      symbol: symbol.toUpperCase(),
      interval,
      limit: String(batchSize),
    });
    if (endTime) params.set('endTime', String(endTime));

    const rows = await requestJson(`/klines?${params}`, { signal });
    if (!Array.isArray(rows) || rows.length === 0) break;

    const candles = normalizeKlines(rows);
    all.unshift(...candles);
    onProgress?.({ loaded: all.length, batch });

    if (rows.length < batchSize) break;
    endTime = Number(rows[0][0]) - 1;
  }

  const seen = new Set();
  return all
    .filter((candle) => {
      if (seen.has(candle.time)) return false;
      seen.add(candle.time);
      return true;
    })
    .sort((a, b) => a.time - b.time);
}

export function fetchFuturesPremiumIndex(symbol, options = {}) {
  return requestJson(`/premiumIndex?symbol=${encodeURIComponent(symbol.toUpperCase())}`, options);
}

export function fetchFuturesFundingRate(symbol, limit = 1, options = {}) {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    limit: String(limit),
  });
  return requestJson(`/fundingRate?${params}`, options);
}

export function fetchFuturesOpenInterest(symbol, options = {}) {
  return requestJson(`/openInterest?symbol=${encodeURIComponent(symbol.toUpperCase())}`, options);
}

export function fetchFuturesTicker24h(symbol, options = {}) {
  return requestJson(`/ticker/24hr?symbol=${encodeURIComponent(symbol.toUpperCase())}`, options);
}

let futuresSymbolsCache = null;

/** Get active USDⓈ-M perpetual contracts for the futures symbol search. */
export async function fetchFuturesSymbols() {
  if (futuresSymbolsCache) return futuresSymbolsCache;

  const data = await requestJson('/exchangeInfo');
  futuresSymbolsCache = (data.symbols || [])
    .filter((item) => (
      item.status === 'TRADING'
      && item.contractType === 'PERPETUAL'
      && item.quoteAsset === 'USDT'
    ))
    .map(({ symbol, baseAsset, quoteAsset }) => ({ symbol, baseAsset, quoteAsset }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return futuresSymbolsCache;
}
