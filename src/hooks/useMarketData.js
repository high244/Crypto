import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMarketData, getCachedMarketData, SOURCE_LABELS } from '../services/marketData';

/**
 * The React entry point for live market requests with Instant SWR (Stale-While-Revalidate)
 * and sub-100ms in-memory cache transitions.
 */
export function useMarketData(symbol, timeframe, market, { coinGeckoId, enabled = true } = {}) {
  const [state, setState] = useState(() => {
    const cached = getCachedMarketData(symbol, timeframe, market);
    if (cached) {
      return {
        data: cached,
        activeSource: cached.source,
        error: '',
        loading: false,
        status: '',
      };
    }
    return {
      data: null,
      activeSource: null,
      error: '',
      loading: true,
      status: 'Menyiapkan data pasar…',
    };
  });

  const requestVersion = useRef(0);

  const refresh = useCallback(async ({ silent = false, bypassCache = false } = {}) => {
    const version = ++requestVersion.current;
    const cached = !bypassCache ? getCachedMarketData(symbol, timeframe, market) : null;

    if (cached) {
      // Instant render from cache (0ms transition delay!)
      setState({
        data: cached,
        activeSource: cached.source,
        error: '',
        loading: false,
        status: '',
      });
    } else if (!silent) {
      setState((previous) => ({
        ...previous,
        activeSource: null,
        error: '',
        loading: true,
        status: 'Menyiapkan data pasar…',
      }));
    }

    try {
      const data = await fetchMarketData({
        symbol,
        timeframe,
        market,
        coinGeckoId,
        bypassCache,
        onAttempt: (source) => {
          if (requestVersion.current !== version) return;
          setState((previous) => ({
            ...previous,
            status: `Mencoba ${SOURCE_LABELS[source]}…`,
          }));
        },
        onProgress: ({ loaded, batch }) => {
          if (requestVersion.current !== version) return;
          setState((previous) => ({
            ...previous,
            status: `Memuat histori · batch ${batch} (${loaded.toLocaleString()} candle)…`,
          }));
        },
      });

      if (requestVersion.current !== version) return null;
      setState({
        data,
        activeSource: data.source,
        error: '',
        loading: false,
        status: '',
      });
      return data;
    } catch (error) {
      if (requestVersion.current !== version) return null;
      setState((previous) => ({
        ...previous,
        activeSource: previous.data ? previous.activeSource : null,
        error: previous.data ? '' : (error.message || 'Gagal memuat data pasar.'),
        loading: false,
        status: '',
      }));
      return null;
    }
  }, [coinGeckoId, market, symbol, timeframe]);

  useEffect(() => {
    if (!enabled) {
      requestVersion.current += 1;
      return undefined;
    }

    refresh();
    return () => {
      requestVersion.current += 1;
    };
  }, [enabled, refresh]);

  return { ...state, refresh };
}
