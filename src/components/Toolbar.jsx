import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchSymbols } from '../services/binanceApi';
import { searchCoins } from '../services/coingeckoApi';

const TIMEFRAMES = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
];

const INDICATORS = [
  { key: 'sma7', label: 'SMA 7' },
  { key: 'sma25', label: 'SMA 25' },
  { key: 'sma99', label: 'SMA 99' },
  { key: 'ema', label: 'EMA 21' },
  { key: 'bb', label: 'BB' },
  { key: 'rsi', label: 'RSI' },
  { key: 'macd', label: 'MACD' },
];

export default function Toolbar({ symbol, dataSource, onSymbolChange, timeframe, onTimeframeChange, indicators, onToggleIndicator }) {
  const [searchText, setSearchText] = useState(symbol);
  const [showDropdown, setShowDropdown] = useState(false);
  const [binanceSymbols, setBinanceSymbols] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [cgResults, setCgResults] = useState([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const wrapperRef = useRef(null);
  const searchTimerRef = useRef(null);

  // Load Binance symbols once
  useEffect(() => {
    setSymbolsLoading(true);
    fetchSymbols()
      .then((syms) => {
        setBinanceSymbols(syms);
        setSymbolsLoading(false);
      })
      .catch(() => setSymbolsLoading(false));
  }, []);

  // Update search text when symbol changes externally
  useEffect(() => {
    setSearchText(symbol);
  }, [symbol]);

  // Filter Binance symbols + search CoinGecko as user types
  useEffect(() => {
    const q = searchText.trim().toUpperCase();

    // Filter Binance
    if (!q) {
      setFiltered(binanceSymbols.slice(0, 50));
    } else {
      setFiltered(
        binanceSymbols
          .filter((s) => s.symbol.includes(q) || s.baseAsset.includes(q))
          .slice(0, 30)
      );
    }

    // Debounced CoinGecko search (only when user is typing something)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.length >= 2) {
      searchTimerRef.current = setTimeout(() => {
        searchCoins(q)
          .then((results) => {
            // Filter out coins that already appear in Binance results
            const binanceBaseAssets = new Set(
              binanceSymbols
                .filter((s) => s.symbol.includes(q) || s.baseAsset.includes(q))
                .map((s) => s.baseAsset.toLowerCase())
            );
            const unique = results.filter((c) => !binanceBaseAssets.has(c.symbol));
            setCgResults(unique.slice(0, 20));
          })
          .catch(() => setCgResults([]));
      }, 300);
    } else {
      setCgResults([]);
    }
  }, [searchText, binanceSymbols]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = useCallback(
    (sym, source = 'binance', coinId = null) => {
      onSymbolChange(sym, source, coinId);
      setSearchText(sym);
      setShowDropdown(false);
    },
    [onSymbolChange]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        const val = searchText.toUpperCase().trim();
        if (val) {
          onSymbolChange(val);
          setShowDropdown(false);
        }
      }
    },
    [searchText, onSymbolChange]
  );

  return (
    <div className="toolbar">
      {/* Symbol search */}
      <div className="symbol-search-wrapper" ref={wrapperRef}>
        <input
          className="symbol-search"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
        />
        {showDropdown && (
          <div className="symbol-dropdown">
            {symbolsLoading ? (
              <div className="symbol-item" style={{ justifyContent: 'center', color: 'var(--text-muted)' }}>Loading symbols...</div>
            ) : filtered.length === 0 && cgResults.length === 0 ? (
              <div className="symbol-item" style={{ justifyContent: 'center', color: 'var(--text-muted)' }}>No results</div>
            ) : (
              <>
                {/* Binance results */}
                {filtered.length > 0 && (
                  <>
                    <div style={{ padding: '4px 12px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' }}>
                      BINANCE
                    </div>
                    {filtered.map((s) => (
                      <div
                        key={s.symbol}
                        className="symbol-item"
                        onClick={() => handleSelect(s.symbol, 'binance')}
                      >
                        <span className="symbol-item-name">
                          {s.baseAsset}
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/{s.quoteAsset}</span>
                        </span>
                        <span className="symbol-item-pair">{s.symbol}</span>
                      </div>
                    ))}
                  </>
                )}
                {/* CoinGecko results */}
                {cgResults.length > 0 && (
                  <>
                    <div style={{ padding: '4px 12px', fontSize: 10, color: '#f7a21b', fontWeight: 600, letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
                      COINGECKO (other exchanges)
                    </div>
                    {cgResults.map((c) => (
                      <div
                        key={c.id}
                        className="symbol-item"
                        onClick={() => handleSelect(c.symbol.toUpperCase() + 'USD', 'coingecko', c.id)}
                      >
                        <span className="symbol-item-name">
                          {c.symbol.toUpperCase()}
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/USD</span>
                        </span>
                        <span className="symbol-item-pair" style={{ color: '#f7a21b' }}>{c.name}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Data source badge */}
      {dataSource && (
        <span style={{
          fontSize: 10,
          padding: '2px 6px',
          borderRadius: 3,
          background: dataSource === 'binance' ? 'rgba(38, 166, 154, 0.15)' : 'rgba(247, 162, 27, 0.15)',
          color: dataSource === 'binance' ? 'var(--green)' : '#f7a21b',
          fontWeight: 600,
        }}>
          {dataSource === 'binance' ? 'Binance' : 'CoinGecko'}
        </span>
      )}

      <div className="toolbar-divider" />

      {/* Timeframes */}
      <div className="toolbar-group">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.value}
            className={`toolbar-btn ${timeframe === tf.value ? 'active' : ''}`}
            onClick={() => onTimeframeChange(tf.value)}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      {/* Indicators */}
      <div className="toolbar-group">
        {INDICATORS.map((ind) => (
          <button
            key={ind.key}
            className={`toolbar-btn ${indicators[ind.key] ? 'indicator-active' : ''}`}
            onClick={() => onToggleIndicator(ind.key)}
          >
            {ind.label}
          </button>
        ))}
      </div>
    </div>
  );
}
