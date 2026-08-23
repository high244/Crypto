import { useState, useEffect, useCallback, useRef } from 'react';
import Chart from './components/Chart';
import Toolbar from './components/Toolbar';
import TickerBar from './components/TickerBar';
import OrderBook from './components/OrderBook';
import RecentTrades from './components/RecentTrades';
import Watchlist from './components/Watchlist';
import AnalysisPanel from './components/AnalysisPanel';
import { fetchKlines } from './services/binanceApi';
import { subscribeKline, subscribeTicker, subscribeTrades, subscribeDepth } from './services/binanceWebSocket';
import { fetchOHLC, fetchCoinMarketData, findCoinId, timeframeToDays } from './services/coingeckoApi';
import { fetchBybitKline, fetchOKXKline, parseCSVData } from './services/exchangeApi';

export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [ticker, setTicker] = useState(null);
  const [orderBook, setOrderBook] = useState(null);
  const [trades, setTrades] = useState([]);
  const [rightTab, setRightTab] = useState('book');
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState('binance'); // 'binance' | 'coingecko' | 'bybit' | 'okx' | 'csv'
  const [exchangeSource, setExchangeSource] = useState('binance'); // toolbar exchange selector
  const [coinGeckoId, setCoinGeckoId] = useState(null);
  const [indicators, setIndicators] = useState({
    sma7: false,
    sma25: true,
    sma99: false,
    ema: false,
    bb: false,
    sar: false,
    rsi: false,
    macd: false,
  });

  const chartRef = useRef(null);
  const wsCleanupRef = useRef([]);
  const pollTimerRef = useRef(null);

  const cleanupWS = useCallback(() => {
    wsCleanupRef.current.forEach((sub) => sub.close());
    wsCleanupRef.current = [];
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // --- BINANCE data loader ---
  const loadBinanceData = useCallback(
    async (sym, tf) => {
      const klines = await fetchKlines(sym, tf, 500);
      setChartData(klines);
      setChartLoading(false);

      const klineSub = subscribeKline(sym, tf, (candle) => {
        if (chartRef.current?.updateCandle) chartRef.current.updateCandle(candle);
        // Update chartData on every tick for real-time accuracy
        setChartData((prev) => {
          const idx = prev.findIndex((d) => d.time === candle.time);
          if (idx >= 0) {
            const u = [...prev];
            u[idx] = candle;
            return u;
          }
          // New candle period started
          return [...prev, candle];
        });
      });

      const tickerSub = subscribeTicker(sym, setTicker);
      const tradesSub = subscribeTrades(sym, (trade) => {
        setTrades((prev) => [trade, ...prev].slice(0, 100));
      });
      const depthSub = subscribeDepth(sym, setOrderBook);

      wsCleanupRef.current = [klineSub, tickerSub, tradesSub, depthSub];
    },
    []
  );

  // --- COINGECKO data loader ---
  const loadCoinGeckoData = useCallback(
    async (cgId, tf) => {
      const days = timeframeToDays(tf);
      const ohlc = await fetchOHLC(cgId, days);
      setChartData(ohlc);
      setChartLoading(false);

      // Fetch initial ticker data
      try {
        const marketData = await fetchCoinMarketData(cgId);
        setTicker(marketData);
      } catch (e) {
        console.error('CoinGecko market data error:', e);
      }

      // Poll for updates every 30 seconds (CoinGecko has no WebSocket)
      pollTimerRef.current = setInterval(async () => {
        try {
          const marketData = await fetchCoinMarketData(cgId);
          setTicker(marketData);
        } catch (e) { /* ignore poll errors */ }
      }, 30000);
    },
    []
  );

  // --- BYBIT data loader ---
  const loadBybitData = useCallback(
    async (sym, tf) => {
      const klines = await fetchBybitKline(sym, tf, 200);
      setChartData(klines);
      setChartLoading(false);
      // Bybit has no free WebSocket for browser, so we poll every 15s
      pollTimerRef.current = setInterval(async () => {
        try {
          const fresh = await fetchBybitKline(sym, tf, 200);
          setChartData(fresh);
        } catch (e) { /* ignore poll errors */ }
      }, 15000);
    },
    []
  );

  // --- OKX data loader ---
  const loadOKXData = useCallback(
    async (sym, tf) => {
      const klines = await fetchOKXKline(sym, tf, 200);
      setChartData(klines);
      setChartLoading(false);
      // OKX has no free WebSocket for browser, so we poll every 15s
      pollTimerRef.current = setInterval(async () => {
        try {
          const fresh = await fetchOKXKline(sym, tf, 200);
          setChartData(fresh);
        } catch (e) { /* ignore poll errors */ }
      }, 15000);
    },
    []
  );

  // --- Main data loader ---
  const loadData = useCallback(
    async (sym, tf, source, cgId) => {
      setChartLoading(true);
      setError('');
      cleanupWS();

      try {
        if (source === 'coingecko' && cgId) {
          await loadCoinGeckoData(cgId, tf);
        } else if (source === 'bybit') {
          await loadBybitData(sym, tf);
        } else if (source === 'okx') {
          await loadOKXData(sym, tf);
        } else {
          await loadBinanceData(sym, tf);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        setError(`Gagal memuat data: ${err.message}`);
        setChartLoading(false);
      }
    },
    [cleanupWS, loadBinanceData, loadCoinGeckoData, loadBybitData, loadOKXData]
  );

  // Load data when symbol/timeframe/source changes
  useEffect(() => {
    if (dataSource === 'csv') return; // CSV data is loaded manually
    setTrades([]);
    setOrderBook(null);
    setTicker(null);
    loadData(symbol, timeframe, dataSource, coinGeckoId);
    return () => cleanupWS();
  }, [symbol, timeframe, dataSource, coinGeckoId, loadData, cleanupWS]);

  // Symbol change handler — detects source
  const handleSymbolChange = useCallback(async (sym, source, cgId) => {
    if (source === 'coingecko' && cgId) {
      setSymbol(sym);
      setDataSource('coingecko');
      setExchangeSource('binance');
      setCoinGeckoId(cgId);
    } else if (source === 'coingecko') {
      // Manual entry — try to find in CoinGecko
      const coin = await findCoinId(sym.replace(/USD[TC]?$/, ''));
      if (coin) {
        setSymbol(sym);
        setDataSource('coingecko');
        setExchangeSource('binance');
        setCoinGeckoId(coin.id);
      }
    } else {
      setSymbol(sym);
      setDataSource(exchangeSource);
      setCoinGeckoId(null);
    }
  }, [exchangeSource]);

  // Exchange source change handler
  const handleExchangeChange = useCallback((exchange) => {
    setExchangeSource(exchange);
    setDataSource(exchange);
    setCoinGeckoId(null);
  }, []);

  // Watchlist always uses current exchange
  const handleWatchlistSelect = useCallback((sym) => {
    setSymbol(sym);
    setDataSource(exchangeSource);
    setCoinGeckoId(null);
  }, [exchangeSource]);

  // CSV data load handler
  const handleLoadCSV = useCallback((csvText) => {
    try {
      const parsed = parseCSVData(csvText);
      setChartData(parsed);
      setDataSource('csv');
      setChartLoading(false);
      cleanupWS();
      setTicker(null);
      setOrderBook(null);
      setTrades([]);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [cleanupWS]);

  const handleTimeframeChange = useCallback((tf) => setTimeframe(tf), []);
  const handleToggleIndicator = useCallback((key) => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isBinanceWS = dataSource === 'binance';

  // Determine source label for header
  const sourceLabels = {
    binance: 'Binance',
    bybit: 'Bybit',
    okx: 'OKX',
    coingecko: 'CoinGecko',
    csv: 'CSV Import',
  };

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
          CryptoView
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          Real-time market data • {sourceLabels[dataSource] || 'Binance'} + CoinGecko
        </span>
        {error && (
          <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 'auto' }}>⚠ {error}</span>
        )}
      </header>

      {/* Left — Watchlist */}
      <div className="panel">
        <Watchlist activeSymbol={symbol} onSelect={handleWatchlistSelect} />
      </div>

      {/* Center — Chart */}
      <div className="center-column">
        <TickerBar ticker={ticker} />
        <Toolbar
          symbol={symbol}
          dataSource={dataSource}
          onSymbolChange={handleSymbolChange}
          timeframe={timeframe}
          onTimeframeChange={handleTimeframeChange}
          indicators={indicators}
          onToggleIndicator={handleToggleIndicator}
          exchangeSource={exchangeSource}
          onExchangeChange={handleExchangeChange}
        />
        <Chart ref={chartRef} data={chartData} indicators={indicators} loading={chartLoading} />
      </div>

      {/* Right — Order Book + Trades + Analysis */}
      <div className="panel" style={{ borderRight: 'none', borderLeft: '1px solid var(--border)' }}>
        <div className="right-panel-tabs">
          <button
            className={`right-panel-tab ${rightTab === 'book' ? 'active' : ''}`}
            onClick={() => setRightTab('book')}
          >
            Order Book
          </button>
          <button
            className={`right-panel-tab ${rightTab === 'trades' ? 'active' : ''}`}
            onClick={() => setRightTab('trades')}
          >
            Trades
          </button>
          <button
            className={`right-panel-tab ${rightTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setRightTab('analysis')}
          >
            Analysis
          </button>
        </div>
        <div className="panel-body">
          {rightTab === 'analysis' ? (
            <AnalysisPanel
              chartData={chartData}
              indicators={indicators}
              dataSource={dataSource}
              onLoadCSV={handleLoadCSV}
            />
          ) : !isBinanceWS ? (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>📊</div>
              Order book & trades tidak tersedia untuk {sourceLabels[dataSource] || dataSource}.
              <br />Fitur ini hanya tersedia untuk Binance (real-time WebSocket).
            </div>
          ) : rightTab === 'book' ? (
            <OrderBook data={orderBook} />
          ) : (
            <RecentTrades trades={trades} />
          )}
        </div>
      </div>
    </div>
  );
}
