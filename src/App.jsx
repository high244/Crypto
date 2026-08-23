import { useState, useEffect, useCallback, useRef } from 'react';
import Chart from './components/Chart';
import Toolbar from './components/Toolbar';
import TickerBar from './components/TickerBar';
import OrderBook from './components/OrderBook';
import RecentTrades from './components/RecentTrades';
import Watchlist from './components/Watchlist';
import { fetchKlines } from './services/binanceApi';
import { subscribeKline, subscribeTicker, subscribeTrades, subscribeDepth } from './services/binanceWebSocket';
import { fetchOHLC, fetchCoinMarketData, findCoinId, timeframeToDays } from './services/coingeckoApi';

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
  const [dataSource, setDataSource] = useState('binance'); // 'binance' | 'coingecko'
  const [coinGeckoId, setCoinGeckoId] = useState(null);
  const [indicators, setIndicators] = useState({
    sma7: false,
    sma25: true,
    sma99: false,
    ema: false,
    bb: false,
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

  // --- Main data loader ---
  const loadData = useCallback(
    async (sym, tf, source, cgId) => {
      setChartLoading(true);
      setError('');
      cleanupWS();

      try {
        if (source === 'coingecko' && cgId) {
          await loadCoinGeckoData(cgId, tf);
        } else {
          await loadBinanceData(sym, tf);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        setError(`Gagal memuat data: ${err.message}`);
        setChartLoading(false);
      }
    },
    [cleanupWS, loadBinanceData, loadCoinGeckoData]
  );

  // Load data when symbol/timeframe/source changes
  useEffect(() => {
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
      setCoinGeckoId(cgId);
    } else if (source === 'coingecko') {
      // Manual entry — try to find in CoinGecko
      const coin = await findCoinId(sym.replace(/USD[TC]?$/, ''));
      if (coin) {
        setSymbol(sym);
        setDataSource('coingecko');
        setCoinGeckoId(coin.id);
      }
    } else {
      setSymbol(sym);
      setDataSource('binance');
      setCoinGeckoId(null);
    }
  }, []);

  // Watchlist always uses Binance
  const handleWatchlistSelect = useCallback((sym) => {
    setSymbol(sym);
    setDataSource('binance');
    setCoinGeckoId(null);
  }, []);

  const handleTimeframeChange = useCallback((tf) => setTimeframe(tf), []);
  const handleToggleIndicator = useCallback((key) => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isCoinGecko = dataSource === 'coingecko';

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
          Real-time market data • Binance + CoinGecko
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
        />
        <Chart ref={chartRef} data={chartData} indicators={indicators} loading={chartLoading} />
      </div>

      {/* Right — Order Book + Trades */}
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
        </div>
        <div className="panel-body">
          {isCoinGecko ? (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>📊</div>
              Order book & trades tidak tersedia untuk data CoinGecko.
              <br />Fitur ini hanya tersedia untuk pair Binance.
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
