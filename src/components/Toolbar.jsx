import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSymbols } from '../services/binanceApi';
import { fetchFuturesSymbols } from '../services/binanceFuturesApi';
import { searchAllCoins, searchCoins } from '../services/coingeckoApi';
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
const MAX_VISIBLE_RESULTS = 60;

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
  const [filtered, setFiltered] = useState([]);
  const [cgResults, setCgResults] = useState([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const wrapperRef = useRef(null);

  const binanceLabel = market === 'futures' ? 'BINANCE FUTURES' : 'BINANCE SPOT';
  const badgeLabel = activeSource ? SOURCE_LABELS[activeSource] : 'Menghubungkan';
  const badgeState = !activeSource
    ? 'loading'
    : activeSource === 'csv' || activeSource === 'sample'
      ? 'manual'
      : LIVE_SOURCES.has(activeSource) ? 'live' : 'polling';

  useEffect(() => {
    let cancelled = false;
    setSymbolsLoading(true);
    setBinanceSymbols([]);

    const loadSymbols = market === 'futures' ? fetchFuturesSymbols : fetchSymbols;
    loadSymbols()
      .then((symbols) => {
        if (!cancelled) setBinanceSymbols(symbols);
      })
      .catch(() => {
        if (!cancelled) setBinanceSymbols([]);
      })
      .finally(() => {
        if (!cancelled) setSymbolsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [market]);

  useEffect(() => {
    setSearchText(symbol);
  }, [symbol]);

  useEffect(() => {
    const query = searchText.trim().toUpperCase();
    if (!showDropdown || query.length < MIN_SEARCH_LENGTH) {
      setFiltered([]);
      setCgResults([]);
      return undefined;
    }

    setFiltered(
      binanceSymbols.filter((item) => (
        item.symbol.includes(query)
        || item.baseAsset.includes(query)
        || item.quoteAsset.includes(query)
      )).slice(0, MAX_VISIBLE_RESULTS)
    );
    setCgResults([]);

    let cancelled = false;
    let instantResults = [];
    let catalogResults = [];
    const updateCoinGeckoResults = () => {
      if (!cancelled) {
        setCgResults(mergeCoinResults(instantResults, catalogResults).slice(0, MAX_VISIBLE_RESULTS));
      }
    };

    const timer = setTimeout(() => {
      searchCoins(query)
        .then((results) => {
          instantResults = results;
          updateCoinGeckoResults();
        })
        .catch(updateCoinGeckoResults);

      searchAllCoins(query)
        .then((results) => {
          catalogResults = results;
          updateCoinGeckoResults();
        })
        .catch(updateCoinGeckoResults);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [binanceSymbols, searchText, showDropdown]);

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
            {symbolsLoading && filtered.length === 0 && cgResults.length === 0 ? (
              <div className="symbol-item symbol-message">Memuat pair dan katalog coin…</div>
            ) : searchText.trim().length < MIN_SEARCH_LENGTH ? (
              <div className="symbol-item symbol-message">Ketik minimal 2 karakter.</div>
            ) : filtered.length === 0 && cgResults.length === 0 ? (
              <div className="symbol-item symbol-message">Tidak ada hasil.</div>
            ) : (
              <>
                {filtered.length > 0 && (
                  <>
                    <div className="symbol-source-heading">{binanceLabel}</div>
                    {filtered.map((item) => (
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
                {cgResults.length > 0 && (
                  <>
                    <div className="symbol-source-heading coingecko">COINGECKO</div>
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
