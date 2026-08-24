import { fetchAllKlines, fetchKlines, fetchTicker24h } from './binanceApi.js';
import {
  fetchAllFuturesKlines,
  fetchFuturesFundingRate,
  fetchFuturesKlines,
  fetchFuturesOpenInterest,
  fetchFuturesPremiumIndex,
  fetchFuturesTicker24h,
} from './binanceFuturesApi.js';
import {
  fetchCoinMarketData,
  fetchDerivativeTicker,
  fetchOHLC,
  resolveCoinGeckoId,
  timeframeToDays,
} from './coingeckoApi.js';
import { fetchHyperliquidAssetContext, fetchHyperliquidCandles } from './hyperliquidApi.js';

export const SOURCE_LABELS = {
  'binance-spot': 'Binance Spot',
  'binance-futures': 'Binance Futures',
  coingecko: 'CoinGecko',
  hyperliquid: 'Hyperliquid',
  csv: 'CSV Manual',
  sample: 'Data Contoh',
};

export const LIVE_SOURCES = new Set(['binance-spot', 'binance-futures', 'hyperliquid']);

const SOURCE_TIMEOUT_MS = 2_000;

const MARKET_DATA_CACHE = new Map();
const CACHE_TTL_MS = 45_000; // 45 seconds fresh cache for instant transitions

export function getCachedMarketData(symbol, timeframe, market) {
  const key = `${String(symbol).toUpperCase()}_${timeframe}_${market}`;
  const entry = MARKET_DATA_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
}

export function setCachedMarketData(symbol, timeframe, market, data) {
  const key = `${String(symbol).toUpperCase()}_${timeframe}_${market}`;
  MARKET_DATA_CACHE.set(key, { data, timestamp: Date.now() });
}

const HYPERLIQUID_PRIORITY_ASSETS = new Set([
  'HYPE', 'PURR', 'AI16Z', 'POPCAT', 'JEFF', 'HFUN', 'PUMP', 'TRUMP', 'FARTCOIN', 'MELANIA', 'VIRTUAL'
]);

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteOr(value, fallback) {
  return finiteNumber(value) ?? fallback;
}

function normalizeTicker(raw, fallbackCandle) {
  const close = finiteOr(raw?.lastPrice ?? raw?.close ?? raw?.markPrice, fallbackCandle?.close ?? null);
  const open = finiteOr(raw?.openPrice ?? raw?.open, fallbackCandle?.open ?? close);
  const change = finiteOr(raw?.priceChange ?? raw?.change, close !== null && open !== null ? close - open : null);
  const changePct = finiteOr(
    raw?.priceChangePercent ?? raw?.changePct,
    change !== null && open ? (change / open) * 100 : null
  );

  return {
    close,
    open,
    high: finiteOr(raw?.highPrice ?? raw?.high, fallbackCandle?.high ?? null),
    low: finiteOr(raw?.lowPrice ?? raw?.low, fallbackCandle?.low ?? null),
    volume: finiteOr(raw?.volume, fallbackCandle?.volume ?? null),
    quoteVolume: finiteOr(raw?.quoteVolume, fallbackCandle?.volume ?? null),
    change,
    changePct,
  };
}

/** Convert every provider's candle representation to the CONFLUX contract. */
function normalizeCandles(candles) {
  const byDate = new Map();
  candles.forEach((candle) => {
    const date = finiteNumber(candle.date ?? candle.time);
    const open = finiteNumber(candle.open);
    const high = finiteNumber(candle.high);
    const low = finiteNumber(candle.low);
    const close = finiteNumber(candle.close);
    if (date === null || open === null || high === null || low === null || close === null) return;

    byDate.set(date, {
      date,
      open,
      high,
      low,
      close,
      volume: finiteNumber(candle.volume) ?? 0,
    });
  });

  const normalized = [...byDate.values()].sort((a, b) => a.date - b.date);
  if (!normalized.length) throw new Error('Sumber data tidak mengembalikan candle yang valid.');
  return normalized;
}

/** Convert the provider-neutral candle contract only at the chart boundary. */
export function toChartCandles(candles) {
  return candles.map((candle) => ({
    time: candle.date ?? candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  }));
}

/** Extract BTC from BTCUSDT, BTC/USD, or plain BTC. */
export function baseAssetFromSymbol(symbol) {
  const normalized = String(symbol || '').toUpperCase().replace(/[\s/_-]/g, '');
  const quote = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'USD']
    .find((item) => normalized.endsWith(item));
  return quote ? normalized.slice(0, -quote.length) : normalized;
}

function formatReason(error) {
  if (error?.name === 'AbortError') return 'timeout';
  return error?.message || 'gagal tanpa detail';
}

async function attemptSource(label, loader) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);

  try {
    return await loader({ signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timeout setelah ${Math.round(SOURCE_TIMEOUT_MS / 1000)} dtk`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadBinanceSpot({ symbol, timeframe, onProgress, signal }) {
  const candlesPromise = timeframe === 'all'
    ? fetchAllKlines(symbol, '1d', onProgress, { signal })
    : fetchKlines(symbol, timeframe, 500, { signal });
  const [candlesResult, tickerResult] = await Promise.allSettled([
    candlesPromise,
    fetchTicker24h(symbol, { signal }),
  ]);

  if (candlesResult.status !== 'fulfilled') throw candlesResult.reason;
  const candles = candlesResult.value;
  const lastCandle = candles[candles.length - 1];

  return {
    candles,
    ticker: normalizeTicker(
      tickerResult.status === 'fulfilled' ? tickerResult.value : null,
      lastCandle
    ),
  };
}

async function loadBinanceFutures({ symbol, timeframe, onProgress, signal }) {
  const candlesPromise = timeframe === 'all'
    ? fetchAllFuturesKlines(symbol, '1d', onProgress, { signal })
    : fetchFuturesKlines(symbol, timeframe, 500, { signal });

  const [candlesResult, premiumResult, fundingHistoryResult, openInterestResult, tickerResult] = await Promise.allSettled([
    candlesPromise,
    fetchFuturesPremiumIndex(symbol, { signal }),
    fetchFuturesFundingRate(symbol, 1, { signal }),
    fetchFuturesOpenInterest(symbol, { signal }),
    fetchFuturesTicker24h(symbol, { signal }),
  ]);

  if (candlesResult.status !== 'fulfilled') throw candlesResult.reason;

  const candles = candlesResult.value;
  const lastCandle = candles[candles.length - 1];
  const premium = premiumResult.status === 'fulfilled' ? premiumResult.value : null;
  const history = fundingHistoryResult.status === 'fulfilled' ? fundingHistoryResult.value : [];
  const openInterestResponse = openInterestResult.status === 'fulfilled' ? openInterestResult.value : null;
  const markPrice = finiteOr(premium?.markPrice, lastCandle?.close ?? null);
  const historyFunding = Array.isArray(history) ? history.at(-1)?.fundingRate : null;
  const fundingRate = finiteOr(premium?.lastFundingRate, finiteNumber(historyFunding));
  const openInterestQuantity = finiteNumber(openInterestResponse?.openInterest);

  return {
    candles,
    ticker: normalizeTicker(
      {
        ...(tickerResult.status === 'fulfilled' ? tickerResult.value : {}),
        markPrice,
      },
      lastCandle
    ),
    fundingRate,
    // Binance returns quantity. Convert it to an estimated USD notional so it
    // matches CoinGecko's derivatives feed and is comparable in the UI.
    openInterest: openInterestQuantity !== null && markPrice !== null
      ? openInterestQuantity * markPrice
      : null,
  };
}

async function loadCoinGecko({ symbol, timeframe, market, coinGeckoId, signal }) {
  const id = coinGeckoId || await resolveCoinGeckoId(symbol, { signal });
  if (!id) throw new Error('CoinGecko: ID coin tidak ditemukan.');

  const requests = [
    fetchOHLC(id, timeframeToDays(timeframe), { signal }),
    fetchCoinMarketData(id, { signal }),
  ];
  if (market === 'futures') requests.push(fetchDerivativeTicker(symbol, { signal }));

  const results = await Promise.allSettled(requests);
  const candlesResult = results[0];
  if (candlesResult.status !== 'fulfilled') throw candlesResult.reason;

  const candles = candlesResult.value;
  const lastCandle = candles[candles.length - 1];
  const ticker = results[1].status === 'fulfilled'
    ? normalizeTicker(results[1].value, lastCandle)
    : normalizeTicker(null, lastCandle);
  const derivative = results[2]?.status === 'fulfilled' ? results[2].value : null;

  if (derivative?.price) ticker.close = derivative.price;
  if (derivative?.changePct !== null && derivative?.changePct !== undefined) {
    ticker.changePct = derivative.changePct;
  }
  if (derivative?.volume) {
    ticker.volume = derivative.volume;
    ticker.quoteVolume = derivative.volume;
  }

  return {
    candles,
    ticker,
    fundingRate: derivative?.fundingRate ?? null,
    openInterest: derivative?.openInterest ?? null,
  };
}

async function loadHyperliquid({ symbol, timeframe, signal }) {
  const coin = baseAssetFromSymbol(symbol);
  const [candlesResult, contextResult] = await Promise.allSettled([
    fetchHyperliquidCandles(coin, timeframe, { signal }),
    fetchHyperliquidAssetContext(coin, { signal }),
  ]);
  if (candlesResult.status !== 'fulfilled') throw candlesResult.reason;

  const candles = candlesResult.value;
  const lastCandle = candles[candles.length - 1];
  const context = contextResult.status === 'fulfilled' ? contextResult.value.context : null;
  const markPrice = finiteOr(context?.markPx, lastCandle?.close ?? null);
  const previousPrice = finiteNumber(context?.prevDayPx);
  const change = markPrice !== null && previousPrice !== null ? markPrice - previousPrice : null;

  return {
    candles,
    ticker: normalizeTicker({
      markPrice,
      open: previousPrice,
      change,
      changePct: change !== null && previousPrice ? (change / previousPrice) * 100 : null,
      volume: context?.dayNtlVlm,
      quoteVolume: context?.dayNtlVlm,
    }, lastCandle),
    fundingRate: finiteNumber(context?.funding),
    openInterest: finiteNumber(context?.openInterest) !== null && markPrice !== null
      ? finiteNumber(context.openInterest) * markPrice
      : null,
  };
}

function toUnifiedResult({ symbol, timeframe, source, result }) {
  const candles = normalizeCandles(result.candles);
  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    candles,
    ...(result.fundingRate !== null && result.fundingRate !== undefined
      ? { fundingRate: result.fundingRate }
      : {}),
    ...(result.openInterest !== null && result.openInterest !== undefined
      ? { openInterest: result.openInterest }
      : {}),
    source,
    fetchedAt: Date.now(),
    // The chart header has richer needs than the required candle contract.
    ticker: normalizeTicker(result.ticker, candles.at(-1)),
  };
}

export class MarketDataUnavailableError extends Error {
  constructor(symbol, market, failures) {
    const details = failures.map(({ source, reason }) => `${SOURCE_LABELS[source]}: ${reason}`).join(' • ');
    super(`Semua sumber ${market === 'futures' ? 'futures/perpetual' : 'spot'} gagal untuk ${symbol}. ${details}. Kamu masih bisa memuat CSV atau data contoh di tab Analysis.`);
    this.name = 'MarketDataUnavailableError';
    this.failures = failures;
  }
}

/**
 * Centralized source selection for the dashboard.
 * Every successful source returns the same MarketData shape:
 * { symbol, timeframe, candles:[{ date, open, high, low, close }],
 *   fundingRate?, openInterest?, source, fetchedAt }
 */
export async function fetchMarketData({ symbol, timeframe, market, coinGeckoId, onAttempt, onProgress, bypassCache = false }) {
  const normalizedMarket = market === 'futures' ? 'futures' : 'spot';

  if (!bypassCache) {
    const cached = getCachedMarketData(symbol, timeframe, normalizedMarket);
    if (cached) {
      return cached;
    }
  }

  const baseAsset = baseAssetFromSymbol(symbol);
  const isHyperliquidNative = HYPERLIQUID_PRIORITY_ASSETS.has(baseAsset);

  let candidates;
  if (isHyperliquidNative) {
    // Hyperliquid first for zero-delay instant DEX load
    candidates = [
      {
        source: 'hyperliquid',
        load: (options) => loadHyperliquid({ symbol, timeframe, ...options }),
      },
      {
        source: normalizedMarket === 'futures' ? 'binance-futures' : 'binance-spot',
        load: (options) => normalizedMarket === 'futures'
          ? loadBinanceFutures({ symbol, timeframe, onProgress, ...options })
          : loadBinanceSpot({ symbol, timeframe, onProgress, ...options }),
      },
      {
        source: 'coingecko',
        load: (options) => loadCoinGecko({ symbol, timeframe, market: normalizedMarket, coinGeckoId, ...options }),
      },
    ];
  } else if (normalizedMarket === 'futures') {
    candidates = [
      {
        source: 'binance-futures',
        load: (options) => loadBinanceFutures({ symbol, timeframe, onProgress, ...options }),
      },
      {
        source: 'hyperliquid',
        load: (options) => loadHyperliquid({ symbol, timeframe, ...options }),
      },
      {
        source: 'coingecko',
        load: (options) => loadCoinGecko({ symbol, timeframe, market: normalizedMarket, coinGeckoId, ...options }),
      },
    ];
  } else {
    candidates = [
      {
        source: 'binance-spot',
        load: (options) => loadBinanceSpot({ symbol, timeframe, onProgress, ...options }),
      },
      {
        source: 'hyperliquid',
        load: (options) => loadHyperliquid({ symbol, timeframe, ...options }),
      },
      {
        source: 'coingecko',
        load: (options) => loadCoinGecko({ symbol, timeframe, market: normalizedMarket, coinGeckoId, ...options }),
      },
    ];
  }

  const failures = [];
  for (const candidate of candidates) {
    onAttempt?.(candidate.source);
    try {
      const result = await attemptSource(SOURCE_LABELS[candidate.source], candidate.load);
      const unified = toUnifiedResult({ symbol, timeframe, source: candidate.source, result });
      setCachedMarketData(symbol, timeframe, normalizedMarket, unified);
      return unified;
    } catch (error) {
      failures.push({ source: candidate.source, reason: formatReason(error) });
    }
  }

  throw new MarketDataUnavailableError(symbol.toUpperCase(), normalizedMarket, failures);
}

/**
 * Fetch a batch of older historical candles before earliestTime for infinite scrolling back.
 */
export async function fetchHistoricalBatch({
  symbol,
  timeframe,
  market,
  earliestTime,
  activeSource,
  limit = 500,
  signal,
}) {
  if (!earliestTime) return [];
  const tf = timeframe === 'all' ? '1d' : timeframe;
  const endTime = Math.floor(earliestTime * 1000) - 1;

  if (activeSource === 'binance-futures' || market === 'futures') {
    try {
      const rows = await fetchFuturesKlines(symbol, tf, limit, { endTime, signal });
      return normalizeCandles(rows);
    } catch {
      try {
        const coin = baseAssetFromSymbol(symbol);
        const rows = await fetchHyperliquidCandles(coin, tf, { endTime, limit, signal });
        return normalizeCandles(rows);
      } catch {
        return [];
      }
    }
  }

  if (activeSource === 'hyperliquid') {
    try {
      const coin = baseAssetFromSymbol(symbol);
      const rows = await fetchHyperliquidCandles(coin, tf, { endTime, limit, signal });
      return normalizeCandles(rows);
    } catch {
      return [];
    }
  }

  // Default: Binance Spot
  try {
    const rows = await fetchKlines(symbol, tf, limit, { endTime, signal });
    return normalizeCandles(rows);
  } catch {
    try {
      const coin = baseAssetFromSymbol(symbol);
      const rows = await fetchHyperliquidCandles(coin, tf, { endTime, limit, signal });
      return normalizeCandles(rows);
    } catch {
      return [];
    }
  }
}

