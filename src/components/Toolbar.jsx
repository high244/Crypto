import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSymbols } from '../services/binanceApi';
import { fetchFuturesSymbols } from '../services/binanceFuturesApi';
import { searchAllCoins, searchCoins } from '../services/coingeckoApi';
import { fetchHyperliquidSymbols } from '../services/hyperliquidApi';
import { searchDexScreener } from '../services/dexscreenerApi';
import { LIVE_SOURCES, SOURCE_LABELS } from '../services/marketData';

const TIMEFRAMES = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: 'ALL', value: 'all' },
];

const INDICATORS = [
  { key: 'sma7', label: 'SMA 7' },
  { key: 'sma25', label: 'SMA 25' },
  { key: 'sma99', label: 'SMA 99' },
  { key: 'ema', label: 'EMA 21' },
  { key: 'bb', label: 'BB' },
  { key: 'sar', label: 'SAR' },
  { key: 'rsi', label: 'RSI' },
  { key: 'macd', label: 'MACD' },
];

const MIN_SEARCH_LENGTH = 2;
const MAX_VISIBLE_RESULTS = 40;

function mergeCoinResults(...resultLists) {
  const seenIds = new Set();
  return resultLists.flat().filter((coin) => {
    if (seenIds.has(coin.id)) return false;
    seenIds.add(coin.id);
    return true;
  });
}

export default function Toolbar({
  symbol,
  activeSource,
  market,
  onMarketChange,
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  indicators,
  onToggleIndicator,
}) {
  const [searchText, setSearchText] = useState(symbol);
  const [showDropdown, setShowDropdown] = useState(false);
  const [binanceSymbols, setBinanceSymbols] = useState([]);
  const [hlSymbols, setHlSymbols] = useState([]);
  const [filteredBinance, setFilteredBinance] = useState([]);
  const [filteredHL, setFilteredHL] = useState([]);
  const [dexResults, setDexResults] = useState([]);
  const [cgResults, setCgResults] = useState([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const wrapperRef = useRef(null);

  const binanceLabel = market === 'futures' ? 'BINANCE FUTURES (Real-Time)' : 'BINANCE SPOT (Real-Time)';
  const badgeLabel = activeSource ? SOURCE_LABELS[activeSource] : 'Menghubungkan';
  const badgeState = !activeSource
    ? 'loading'
    : activeSource === 'csv' || activeSource === 'sample'
      ? 'manual'
      : LIVE_SOURCES.has(activeSource) ? 'live' : 'polling';

  // Load Binance and Hyperliquid symbols
  useEffect(() => {
    let cancelled = false;
    setSymbolsLoading(true);
    setBinanceSymbols([]);

    const loadBinance = market === 'futures' ? fetchFuturesSymbols : fetchSymbols;
    Promise.allSettled([
      loadBinance(),
      fetchHyperliquidSymbols(),
    ]).then(([binanceRes, hlRes]) => {
      if (cancelled) return;
      if (binanceRes.status === 'fulfilled') setBinanceSymbols(binanceRes.value);
      if (hlRes.status === 'fulfilled') setHlSymbols(hlRes.value);
    }).finally(() => {
      if (!cancelled) setSymbolsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [market]);

  useEffect(() => {
    setSearchText(symbol);
  }, [symbol]);

  // Debounced search across Binance, Hyperliquid, DexScreener, and CoinGecko
  useEffect(() => {
    const query = searchText.trim().toUpperCase();
    if (!showDropdown || query.length < MIN_SEARCH_LENGTH) {
      setFilteredBinance([]);
      setFilteredHL([]);
      setDexResults([]);
      setCgResults([]);
      return undefined;
    }

    // 1. Instant Binance filter
    setFilteredBinance(
      binanceSymbols.filter((item) => (
        item.symbol.includes(query)
        || item.baseAsset.includes(query)
        || item.quoteAsset.includes(query)
      )).slice(0, MAX_VISIBLE_RESULTS)
    );

    // 2. Instant Hyperliquid filter
    setFilteredHL(
      hlSymbols.filter((item) => (
        item.symbol.includes(query)
        || item.baseAsset.includes(query)
      )).slice(0, 20)
    );

    let cancelled = false;
    let instantCg = [];
    let catalogCg = [];

    const updateCoinGeckoResults = () => {
      if (!cancelled) {
        setCgResults(mergeCoinResults(instantCg, catalogCg).slice(0, 25));
      }
    };

    const timer = setTimeout(() => {
      // 3. Fast DexScreener search
      searchDexScreener(query)
        .then((results) => {
          if (!cancelled) setDexResults(results.slice(0, 15));
        })
        .catch(() => {
          if (!cancelled) setDexResults([]);
        });

      // 4. CoinGecko search fallback
      searchCoins(query)
        .then((results) => {
          instantCg = results;
          updateCoinGeckoResults();
        })
        .catch(updateCoinGeckoResults);

      searchAllCoins(query)
        .then((results) => {
          catalogCg = results;
          updateCoinGeckoResults();
        })
        .catch(updateCoinGeckoResults);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [binanceSymbols, hlSymbols, searchText, showDropdown]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const selectSymbol = useCallback((nextSymbol, coinGeckoId = null) => {
    onSymbolChange(nextSymbol, coinGeckoId);
    setSearchText(nextSymbol);
    setShowDropdown(false);
  }, [onSymbolChange]);

  const handleKeyDown = useCallback((event) => {
    if (event.key !== 'Enter') return;
    const nextSymbol = searchText.toUpperCase().trim();
    if (nextSymbol) selectSymbol(nextSymbol);
  }, [searchText, selectSymbol]);

  const hasAnyResults = filteredBinance.length > 0
    || filteredHL.length > 0
    || dexResults.length > 0
    || cgResults.length > 0;

  return (
    <div className="toolbar">
      <div className="symbol-search-wrapper" ref={wrapperRef}>
        <input
          className="symbol-search"
          value={searchText}
          onChange={(event) => {
            setSearchText(event.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder="Cari coin atau pair…"
          aria-label="Cari simbol crypto"
        />
        {showDropdown && (
          <div className="symbol-dropdown">
            {symbolsLoading && !hasAnyResults ? (
              <div className="symbol-item symbol-message">Memuat pair dan katalog coin…</div>
            ) : searchText.trim().length < MIN_SEARCH_LENGTH ? (
              <div className="symbol-item symbol-message">Ketik minimal 2 karakter.</div>
            ) : !hasAnyResults ? (
              <div className="symbol-item symbol-message">Tidak ada hasil.</div>
            ) : (
              <>
                {/* 1. Binance Section */}
                {filteredBinance.length > 0 && (
                  <>
                    <div className="symbol-source-heading">{binanceLabel}</div>
                    {filteredBinance.map((item) => (
                      <button
                        key={item.symbol}
                        className="symbol-item"
                        onClick={() => selectSymbol(item.symbol)}
                        type="button"
                      >
                        <span className="symbol-item-name">
                          {item.baseAsset}<span className="symbol-item-quote">/{item.quoteAsset}</span>
                        </span>
                        <span className="symbol-item-pair">{item.symbol}</span>
                      </button>
                    ))}
                  </>
                )}

                {/* 2. Hyperliquid Section (0-Delay Real-time DEX) */}
                {filteredHL.length > 0 && (
                  <>
                    <div className="symbol-source-heading hyperliquid">HYPERLIQUID (Real-Time DEX)</div>
                    {filteredHL.map((item) => (
                      <button
                        key={`hl_${item.baseAsset}`}
                        className="symbol-item"
                        onClick={() => selectSymbol(`${item.baseAsset}USDT`)}
                        type="button"
                      >
                        <span className="symbol-item-name">
                          {item.baseAsset}<span className="symbol-item-quote">/USD</span>
                        </span>
                        <span className="symbol-item-pair hyperliquid">Real-Time Perp</span>
                      </button>
                    ))}
                  </>
                )}

                {/* 3. DexScreener Section (Fast Multi-Chain Tracker) */}
                {dexResults.length > 0 && (
                  <>
                    <div className="symbol-source-heading dexscreener">DEXSCREENER (Multi-Chain DEX)</div>
                    {dexResults.map((item) => (
                      <button
                        key={item.id}
                        className="symbol-item"
                        onClick={() => selectSymbol(`${item.baseAsset}USDT`)}
                        type="button"
                      >
                        <span className="symbol-item-name">
                          {item.baseAsset}<span className="symbol-item-quote">/{item.quoteAsset}</span>
                        </span>
                        <span className="symbol-item-pair dexscreener">
                          <span className="dex-chain-tag">{item.chainId}</span>
                          ${item.priceUsd < 1 ? item.priceUsd.toFixed(4) : item.priceUsd.toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </>
                )}

                {/* 4. CoinGecko Catalog Fallback */}
                {cgResults.length > 0 && (
                  <>
                    <div className="symbol-source-heading coingecko">COINGECKO (Catalog)</div>
                    {cgResults.map((coin) => (
                      <button
                        key={coin.id}
                        className="symbol-item"
                        onClick={() => selectSymbol(`${coin.symbol.toUpperCase()}USD`, coin.id)}
                        type="button"
                      >
                        <span className="symbol-item-name">
                          {coin.symbol.toUpperCase()}<span className="symbol-item-quote">/USD</span>
                        </span>
                        <span className="symbol-item-pair coingecko">{coin.name}</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <span className={`source-badge ${badgeState}`} title="Sumber data aktif">
        Sumber data: {badgeLabel}{activeSource && ` (${badgeState})`}
      </span>

      <div className="toolbar-divider" />

      <div className="toolbar-group market-toggle" aria-label="Jenis pasar">
        <button
          className={`toolbar-btn ${market === 'spot' ? 'active' : ''}`}
          onClick={() => onMarketChange('spot')}
          type="button"
        >
          Spot
        </button>
        <button
          className={`toolbar-btn ${market === 'futures' ? 'active' : ''}`}
          onClick={() => onMarketChange('futures')}
          type="button"
        >
          Futures
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        {TIMEFRAMES.map((item) => (
          <button
            key={item.value}
            className={`toolbar-btn ${timeframe === item.value ? 'active' : ''}`}
            onClick={() => onTimeframeChange(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        {INDICATORS.map((indicator) => (
          <button
            key={indicator.key}
            className={`toolbar-btn ${indicators[indicator.key] ? 'indicator-active' : ''}`}
            onClick={() => onToggleIndicator(indicator.key)}
            type="button"
          >
            {indicator.label}
          </button>
        ))}
      </div>
    </div>
  );
}
