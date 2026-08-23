import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMarketData, SOURCE_LABELS } from '../services/marketData';

const initialState = {
  data: null,
  activeSource: null,
  error: '',
  loading: true,
  status: '',
};

/**
 * The sole React entry point for live market requests. It owns provider
 * fallback, cancellation-by-request-version, source state, and retrying.
 */
export function useMarketData(symbol, timeframe, market, { coinGeckoId, enabled = true } = {}) {
  const [state, setState] = useState(initialState);
  const requestVersion = useRef(0);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    const version = ++requestVersion.current;
    if (!silent) {
      setState((previous) => ({
        ...previous,
        activeSource: null,
        error: '',
        loading: true,
        status: 'Menyiapkan data pasar…',
      }));
    } else {
      setState((previous) => ({ ...previous, error: '', status: 'Memperbarui data pasar…' }));
    }

    try {
      const data = await fetchMarketData({
        symbol,
        timeframe,
        market,
        coinGeckoId,
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
        activeSource: null,
        error: error.message || 'Gagal memuat data pasar.',
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
