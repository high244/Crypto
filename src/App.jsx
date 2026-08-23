import { useCallback, useEffect, useRef, useState } from 'react';
import Chart from './components/Chart';
import Toolbar from './components/Toolbar';
import TickerBar from './components/TickerBar';
import OrderBook from './components/OrderBook';
import RecentTrades from './components/RecentTrades';
import Watchlist from './components/Watchlist';
import AnalysisPanel from './components/AnalysisPanel';
import { useMarketData } from './hooks/useMarketData';
import { useChartDrawings } from './hooks/useChartDrawings';
import { subscribeDepth, subscribeKline, subscribeTicker, subscribeTrades } from './services/binanceWebSocket';
import { subscribeHyperliquidAssetContext, subscribeHyperliquidCandle } from './services/hyperliquidWebSocket';
import { parseCSVData } from './services/exchangeApi';
import { baseAssetFromSymbol, SOURCE_LABELS, toChartCandles } from './services/marketData';
import { createSampleCandles } from './services/sampleData';

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tickerFromCandles(candles) {
  if (!candles.length) return null;
  const first = candles[0];
  const last = candles[candles.length - 1];
  const close = last.close;
  const change = close - first.open;
  return {
    close,
    open: first.open,
    high: Math.max(...candles.map((candle) => candle.high)),
    low: Math.min(...candles.map((candle) => candle.low)),
    volume: 0,
    quoteVolume: 0,
    change,
    changePct: first.open ? (change / first.open) * 100 : 0,
  };
}

function normalizeRequestedSymbol(value) {
  const compact = value.toUpperCase().replace(/[\s/_-]/g, '');
  if (!compact) return '';
  return /(?:USDT|USDC|FDUSD|BUSD|TUSD|USD)$/.test(compact) ? compact : `${compact}USDT`;
}

export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [market, setMarket] = useState('spot');
  const [coinGeckoId, setCoinGeckoId] = useState(null);
  const [manualFeed, setManualFeed] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [ticker, setTicker] = useState(null);
  const [futuresMetrics, setFuturesMetrics] = useState({ fundingRate: null, openInterest: null });
  const [orderBook, setOrderBook] = useState(null);
  const [trades, setTrades] = useState([]);
  const [rightTab, setRightTab] = useState('book');
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
  const streamCleanupRef = useRef([]);
  const isManual = Boolean(manualFeed);
  const chartDrawings = useChartDrawings(symbol, market);
  const {
    data: marketData,
    activeSource,
    error: liveError,
    loading,
    status,
    refresh,
  } = useMarketData(symbol, timeframe, market, {
    coinGeckoId,
    enabled: !isManual,
  });

  const clearLiveStreams = useCallback(() => {
    streamCleanupRef.current.forEach((subscription) => subscription.close());
    streamCleanupRef.current = [];
  }, []);

  const applyLiveCandle = useCallback((candle) => {
    chartRef.current?.updateCandle(candle);
    setChartData((previous) => {
      const index = previous.findIndex((item) => item.time === candle.time);
      if (index >= 0) {
        const next = [...previous];
        next[index] = candle;
        return next;
      }
      return [...previous, candle].sort((a, b) => a.time - b.time);
    });
  }, []);

  useEffect(() => {
    if (isManual || !marketData) return;
    setChartData(toChartCandles(marketData.candles));
    setTicker(marketData.ticker || tickerFromCandles(toChartCandles(marketData.candles)));
    setFuturesMetrics({
      fundingRate: marketData.fundingRate ?? null,
      openInterest: marketData.openInterest ?? null,
    });
  }, [isManual, marketData]);

  useEffect(() => {
    if (!manualFeed) return;
    setChartData(manualFeed.candles);
    setTicker(tickerFromCandles(manualFeed.candles));
    setFuturesMetrics({ fundingRate: null, openInterest: null });
    setOrderBook(null);
    setTrades([]);
  }, [manualFeed]);

  useEffect(() => {
    clearLiveStreams();
    // Never let a previous symbol/source keep writing into the chart while a
    // replacement request is resolving. This is especially important when a
    // fallback chain ultimately fails: the empty/error state must not look
    // like fresh data from the symbol selected just before it.
    if (isManual || loading || !activeSource) return undefined;

    const subscriptions = [];
    const streamTimeframe = timeframe === 'all' ? '1d' : timeframe;

    if (activeSource === 'binance-spot' || activeSource === 'binance-futures') {
      const binanceMarket = activeSource === 'binance-futures' ? 'futures' : 'spot';
      subscriptions.push(
        subscribeKline(symbol, streamTimeframe, applyLiveCandle, binanceMarket),
        subscribeTicker(symbol, setTicker, binanceMarket),
        subscribeTrades(symbol, (trade) => {
          setTrades((previous) => [trade, ...previous].slice(0, 100));
        }, binanceMarket),
        subscribeDepth(symbol, setOrderBook, binanceMarket),
      );
    }

    if (activeSource === 'hyperliquid') {
      const coin = baseAssetFromSymbol(symbol);
      subscriptions.push(
        subscribeHyperliquidCandle(coin, streamTimeframe, applyLiveCandle),
        subscribeHyperliquidAssetContext(coin, (context) => {
          const markPrice = finiteNumber(context.markPx);
          const previousPrice = finiteNumber(context.prevDayPx);
          const change = markPrice !== null && previousPrice !== null ? markPrice - previousPrice : null;
          setTicker((previous) => ({
            ...(previous || {}),
            close: markPrice ?? previous?.close ?? null,
            open: previousPrice ?? previous?.open ?? markPrice ?? null,
            change,
            changePct: change !== null && previousPrice ? (change / previousPrice) * 100 : previous?.changePct ?? null,
            volume: finiteNumber(context.dayNtlVlm) ?? previous?.volume ?? null,
            quoteVolume: finiteNumber(context.dayNtlVlm) ?? previous?.quoteVolume ?? null,
          }));
          setFuturesMetrics({
            fundingRate: finiteNumber(context.funding),
            openInterest: finiteNumber(context.openInterest) !== null && markPrice !== null
              ? finiteNumber(context.openInterest) * markPrice
              : null,
          });
        }),
      );
    }

    streamCleanupRef.current = subscriptions;
    return clearLiveStreams;
  }, [activeSource, applyLiveCandle, clearLiveStreams, isManual, loading, symbol, timeframe]);

  useEffect(() => () => clearLiveStreams(), [clearLiveStreams]);

  useEffect(() => {
    if (isManual || !activeSource) return undefined;
    // Futures OI/funding and fallback providers need a small REST refresh even
    // while the primary price stream is live.
    const interval = activeSource === 'binance-spot' ? 60_000 : 30_000;
    const timer = window.setInterval(() => refresh({ silent: true }), interval);
    return () => window.clearInterval(timer);
  }, [activeSource, isManual, refresh]);

  const resetLivePanels = useCallback(({ clearChart = false } = {}) => {
    clearLiveStreams();
    if (clearChart) setChartData([]);
    setTicker(null);
    setOrderBook(null);
    setTrades([]);
    setFuturesMetrics({ fundingRate: null, openInterest: null });
  }, [clearLiveStreams]);

  const handleSymbolChange = useCallback((nextSymbol, nextCoinGeckoId = null) => {
    const normalized = normalizeRequestedSymbol(nextSymbol);
    if (!normalized) return;
    setManualFeed(null);
    setSymbol(normalized);
    setCoinGeckoId(nextCoinGeckoId);
    resetLivePanels({ clearChart: true });
  }, [resetLivePanels]);

  const handleMarketChange = useCallback((nextMarket) => {
    if (nextMarket === market) return;
    setManualFeed(null);
    setMarket(nextMarket);
    resetLivePanels({ clearChart: true });
  }, [market, resetLivePanels]);

  const handleWatchlistSelect = useCallback((nextSymbol) => {
    handleSymbolChange(nextSymbol);
  }, [handleSymbolChange]);

  const handleLoadCSV = useCallback((csvText) => {
    const parsed = parseCSVData(csvText);
    setManualFeed({ source: 'csv', candles: parsed });
    resetLivePanels();
  }, [resetLivePanels]);

  const handleLoadSample = useCallback(() => {
    const candles = createSampleCandles(symbol, timeframe);
    setManualFeed({ source: 'sample', candles });
    resetLivePanels();
  }, [symbol, timeframe, resetLivePanels]);

  const handleTimeframeChange = useCallback((nextTimeframe) => {
    if (nextTimeframe === timeframe) return;
    setTimeframe(nextTimeframe);
    if (!isManual) resetLivePanels({ clearChart: true });
  }, [isManual, resetLivePanels, timeframe]);
  const handleToggleIndicator = useCallback((key) => {
    setIndicators((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const visibleSource = manualFeed?.source || activeSource;
  const sourceLabel = SOURCE_LABELS[visibleSource] || '—';
  const displayError = !isManual ? liveError : '';
  const hasBinancePanels = !isManual && (
    activeSource === 'binance-spot' || activeSource === 'binance-futures'
  );

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
          CONFLUX
        </div>
        <span className="header-context">
          Analisis {market === 'futures' ? 'Futures / Perpetual' : 'Spot'} · {sourceLabel}
        </span>
        {displayError && <span className="app-error">⚠ {displayError}</span>}
      </header>

      <div className="panel">
        <Watchlist activeSymbol={symbol} onSelect={handleWatchlistSelect} market={market} />
      </div>

      <div className="center-column">
        <TickerBar
          ticker={ticker}
          market={market}
          fundingRate={futuresMetrics.fundingRate}
          openInterest={futuresMetrics.openInterest}
        />
        <Toolbar
          symbol={symbol}
          activeSource={visibleSource}
          market={market}
          onMarketChange={handleMarketChange}
          onSymbolChange={handleSymbolChange}
          timeframe={timeframe}
          onTimeframeChange={handleTimeframeChange}
          indicators={indicators}
          onToggleIndicator={handleToggleIndicator}
        />
        <Chart
          ref={chartRef}
          data={chartData}
          indicators={indicators}
          loading={!isManual && loading}
          loadingProgress={!isManual ? status : ''}
          emptyMessage={displayError ? 'Sumber live tidak tersedia. Buka Analysis → CSV untuk import atau tampilkan data contoh.' : ''}
          {...chartDrawings}
        />
      </div>

      <div className="panel right-panel">
        <div className="right-panel-tabs">
          <button
            className={`right-panel-tab ${rightTab === 'book' ? 'active' : ''}`}
            onClick={() => setRightTab('book')}
            type="button"
          >
            Order Book
          </button>
          <button
            className={`right-panel-tab ${rightTab === 'trades' ? 'active' : ''}`}
            onClick={() => setRightTab('trades')}
            type="button"
          >
            Trades
          </button>
          <button
            className={`right-panel-tab ${rightTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setRightTab('analysis')}
            type="button"
          >
            Analysis
          </button>
        </div>
        <div className="panel-body">
          {rightTab === 'analysis' ? (
            <AnalysisPanel
              chartData={chartData}
              onLoadCSV={handleLoadCSV}
              onLoadSample={handleLoadSample}
            />
          ) : !hasBinancePanels ? (
            <div className="market-panel-message">
              <div className="market-panel-message-icon">◫</div>
              Order book dan trades hanya ditampilkan saat sumber aktif adalah Binance Spot/Futures.
              <br />Chart tetap berjalan dengan {sourceLabel} bila tersedia.
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
