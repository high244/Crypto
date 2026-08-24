import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  LineStyle,
} from 'lightweight-charts';
import { calcSMA, calcEMA, calcBollingerBands, calcRSI, calcMACD, calcParabolicSAR } from '../utils/indicators';
import ChartDrawingOverlay from './ChartDrawingOverlay';

const INDICATOR_COLORS = {
  sma7: '#f7a21b',
  sma25: '#7b61ff',
  sma99: '#ff6d00',
  ema: '#00bcd4',
  bbUpper: 'rgba(41, 98, 255, 0.5)',
  bbMiddle: 'rgba(41, 98, 255, 0.7)',
  bbLower: 'rgba(41, 98, 255, 0.5)',
  rsi: '#7b61ff',
  macdLine: '#2962ff',
  signal: '#ff6d00',
};

const TIMEFRAME_SECONDS = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 3600,
  '4h': 4 * 3600,
  '1d': 86400,
  '1w': 7 * 86400,
  'all': 86400,
};

function getDynamicPriceFormat(candles) {
  if (!candles?.length) return { type: 'price', precision: 2, minMove: 0.01 };
  const sample = candles[candles.length - 1]?.close || candles[0]?.close || 100;
  if (sample >= 100) return { type: 'price', precision: 2, minMove: 0.01 };
  if (sample >= 1) return { type: 'price', precision: 4, minMove: 0.0001 };
  if (sample >= 0.01) return { type: 'price', precision: 5, minMove: 0.00001 };
  if (sample >= 0.0001) return { type: 'price', precision: 7, minMove: 0.0000001 };
  return { type: 'price', precision: 8, minMove: 0.00000001 };
}

const NOOP = () => {};

const Chart = forwardRef(function Chart({
  data,
  indicators,
  symbol = 'BTCUSDT',
  timeframe = '1h',
  onLoadMoreHistory,
  loading,
  loadingProgress,
  emptyMessage,
  drawingScope,
  drawings = [],
  drawingMode = 'select',
  selectedDrawingId = null,
  onDrawingModeChange = NOOP,
  onAddDrawing = NOOP,
  onSelectDrawing = NOOP,
  onDeleteDrawing = NOOP,
  onUndoDrawing = NOOP,
  onRedoDrawing = NOOP,
  onDeleteSelectedDrawing = NOOP,
  onClearDrawings = NOOP,
  canUndoDrawing = false,
  canRedoDrawing = false,
}, ref) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const indicatorSeriesRef = useRef({});
  const [drawingApi, setDrawingApi] = useState({ chart: null, series: null });
  const [drawingApiVersion, setDrawingApiVersion] = useState(0);
  const [countdown, setCountdown] = useState('');
  const [priceCoord, setPriceCoord] = useState(null);
  const lastCloseRef = useRef(null);
  const lastInitialKey = useRef('');
  const isPagingRef = useRef(false);

  const updatePriceCoordinate = useCallback(() => {
    if (!candleSeriesRef.current || lastCloseRef.current === null) return;
    try {
      const y = candleSeriesRef.current.priceToCoordinate(lastCloseRef.current);
      if (y !== null && Number.isFinite(y)) {
        setPriceCoord(y);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Live bar countdown
  useEffect(() => {
    const update = () => {
      const tfSec = TIMEFRAME_SECONDS[timeframe] || 3600;
      const now = Math.floor(Date.now() / 1000);
      const remaining = tfSec - (now % tfSec);

      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      if (hours > 0) {
        setCountdown(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      } else {
        setCountdown(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      }

      updatePriceCoordinate();
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timeframe, updatePriceCoordinate]);

  // Expose updateCandle to parent via ref (Zero-lag tick by tick)
  useImperativeHandle(ref, () => ({
    updateCandle(candle) {
      lastCloseRef.current = candle.close;
      if (candleSeriesRef.current) {
        candleSeriesRef.current.update({
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
        const y = candleSeriesRef.current.priceToCoordinate(candle.close);
        if (y !== null && Number.isFinite(y)) setPriceCoord(y);
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({
          time: candle.time,
          value: candle.volume,
          color: candle.close >= candle.open ? 'rgba(63, 167, 150, 0.35)' : 'rgba(224, 108, 92, 0.35)',
        });
      }
    },
  }), []);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#1C2029' },
        textColor: '#E8E6DF',
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(42, 47, 59, 0.5)' },
        horzLines: { color: 'rgba(42, 47, 59, 0.5)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(232, 163, 61, 0.4)',
          labelBackgroundColor: '#E8A33D',
        },
        horzLine: {
          color: 'rgba(232, 163, 61, 0.4)',
          labelBackgroundColor: '#E8A33D',
        },
      },
      rightPriceScale: {
        borderColor: '#2A2F3B',
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.15 },
        alignLabels: true,
      },
      timeScale: {
        borderColor: '#2A2F3B',
        timeVisible: true,
        secondsVisible: true,
        shiftVisibleRangeOnNewBar: true,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 1,
      },
      localization: {
        dateFormat: 'yyyy-MM-dd',
        timeFormatter: (timestamp) => {
          const d = new Date(timestamp * 1000);
          const h = String(d.getHours()).padStart(2, '0');
          const m = String(d.getMinutes()).padStart(2, '0');
          const s = String(d.getSeconds()).padStart(2, '0');
          return `${h}:${m}:${s}`;
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#3FA796',
      downColor: '#E06C5C',
      borderDownColor: '#E06C5C',
      borderUpColor: '#3FA796',
      wickDownColor: '#E06C5C',
      wickUpColor: '#3FA796',
    });

    // Volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      updatePriceCoordinate();
    });
    chart.subscribeCrosshairMove(() => {
      updatePriceCoordinate();
    });

    setDrawingApi((previous) => (
      previous.chart === chart && previous.series === candleSeries
        ? previous
        : { chart, series: candleSeries }
    ));
    setDrawingApiVersion((previous) => previous + 1);

    // Responsive resize
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
          setDrawingApiVersion((previous) => previous + 1);
        }
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      indicatorSeriesRef.current = {};
      setDrawingApi((previous) => (
        previous.chart === chart ? { chart: null, series: null } : previous
      ));
    };
  }, []);

  // Infinite backward scrolling listener
  useEffect(() => {
    if (!chartRef.current || !onLoadMoreHistory) return;
    const chart = chartRef.current;

    const handleLogicalRangeChange = (range) => {
      if (!range) return;
      // When the user scrolls near the left edge (< 20 bars left)
      if (range.from < 20 && !isPagingRef.current && data?.length > 10) {
        isPagingRef.current = true;
        onLoadMoreHistory().finally(() => {
          setTimeout(() => {
            isPagingRef.current = false;
          }, 600);
        });
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
    };
  }, [data, onLoadMoreHistory]);

  // Update data & dynamic formatting (NO rubberbanding on live ticks)
  useEffect(() => {
    if (!candleSeriesRef.current || !data?.length || !chartRef.current) return;

    const currentKey = `${symbol}_${timeframe}`;
    const isNewSymbolOrTimeframe = lastInitialKey.current !== currentKey;

    // Apply dynamic price precision for low/high priced coins (e.g. PEPE, HYPE, BTC)
    candleSeriesRef.current.applyOptions({
      priceFormat: getDynamicPriceFormat(data),
    });

    candleSeriesRef.current.setData(
      data.map((d) => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }))
    );
    volumeSeriesRef.current?.setData(
      data.map((d) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(63, 167, 150, 0.35)' : 'rgba(224, 108, 92, 0.35)',
      }))
    );

    const last = data[data.length - 1];
    if (last) {
      lastCloseRef.current = last.close;
      setTimeout(updatePriceCoordinate, 50);
    }

    // Only auto-fit and auto-scale on first load of symbol/timeframe!
    // Never reset user view on tick or prepend updates!
    if (isNewSymbolOrTimeframe) {
      lastInitialKey.current = currentKey;
      chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      chartRef.current.timeScale().fitContent();
      setDrawingApiVersion((previous) => previous + 1);
    }
  }, [data, symbol, timeframe, updatePriceCoordinate]);

  // Update indicators
  useEffect(() => {
    if (!chartRef.current || !data?.length) return;
    const chart = chartRef.current;

    // Remove old indicator series
    Object.values(indicatorSeriesRef.current).forEach((s) => {
      try { chart.removeSeries(s); } catch { /* ignore */ }
    });
    indicatorSeriesRef.current = {};

    // SMA overlays
    if (indicators.sma7) {
      const vals = calcSMA(data, 7).filter(Boolean);
      if (vals.length) {
        const s = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.sma7, lineWidth: 1, title: 'SMA 7' });
        s.setData(vals);
        indicatorSeriesRef.current.sma7 = s;
      }
    }
    if (indicators.sma25) {
      const vals = calcSMA(data, 25).filter(Boolean);
      if (vals.length) {
        const s = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.sma25, lineWidth: 1, title: 'SMA 25' });
        s.setData(vals);
        indicatorSeriesRef.current.sma25 = s;
      }
    }
    if (indicators.sma99) {
      const vals = calcSMA(data, 99).filter(Boolean);
      if (vals.length) {
        const s = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.sma99, lineWidth: 1, title: 'SMA 99' });
        s.setData(vals);
        indicatorSeriesRef.current.sma99 = s;
      }
    }

    // EMA
    if (indicators.ema) {
      const vals = calcEMA(data, 21).filter(Boolean);
      if (vals.length) {
        const s = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.ema, lineWidth: 1, title: 'EMA 21' });
        s.setData(vals);
        indicatorSeriesRef.current.ema = s;
      }
    }

    // Bollinger Bands
    if (indicators.bb) {
      const { upper, middle, lower } = calcBollingerBands(data, 20, 2);
      const uF = upper.filter(Boolean);
      const mF = middle.filter(Boolean);
      const lF = lower.filter(Boolean);
      if (uF.length) {
        const su = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.bbUpper, lineWidth: 1, title: 'BB↑' });
        su.setData(uF);
        indicatorSeriesRef.current.bbU = su;
        const sm = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.bbMiddle, lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB' });
        sm.setData(mF);
        indicatorSeriesRef.current.bbM = sm;
        const sl = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.bbLower, lineWidth: 1, title: 'BB↓' });
        sl.setData(lF);
        indicatorSeriesRef.current.bbL = sl;
      }
    }

    // RSI in separate pane
    if (indicators.rsi) {
      const vals = calcRSI(data, 14).filter(Boolean);
      if (vals.length) {
        const s = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.rsi,
          lineWidth: 1.5,
          title: 'RSI 14',
          priceScaleId: 'rsi',
        }, 1);
        s.setData(vals);
        chart.priceScale('rsi', 1).applyOptions({
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });
        indicatorSeriesRef.current.rsi = s;
      }
    }

    // MACD in separate pane
    if (indicators.macd) {
      const { macdLine, signalLine, histogram } = calcMACD(data, 12, 26, 9);
      const mlF = macdLine.filter(Boolean);
      const slF = signalLine.filter(Boolean);
      const hF = histogram.filter(Boolean);
      if (mlF.length) {
        const sml = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.macdLine,
          lineWidth: 1.5,
          title: 'MACD',
          priceScaleId: 'macd',
        }, 2);
        sml.setData(mlF);
        indicatorSeriesRef.current.macdLine = sml;

        const ssl = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.signal,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          title: 'Signal',
          priceScaleId: 'macd',
        }, 2);
        ssl.setData(slF);
        indicatorSeriesRef.current.macdSignal = ssl;

        const sh = chart.addSeries(HistogramSeries, {
          priceScaleId: 'macd',
          title: 'Hist',
        }, 2);
        sh.setData(hF);
        indicatorSeriesRef.current.macdHist = sh;

        chart.priceScale('macd', 2).applyOptions({
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });
      }
    }

    // Parabolic SAR
    if (indicators.sar) {
      const { sarUp, sarDown } = calcParabolicSAR(data, 0.02, 0.2);
      const upF = sarUp.filter(Boolean);
      const downF = sarDown.filter(Boolean);
      if (upF.length) {
        const su = chart.addSeries(LineSeries, {
          color: '#26a69a',
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          pointMarkersVisible: true,
          pointMarkersRadius: 2.5,
          title: 'SAR ↑',
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        su.setData(upF);
        indicatorSeriesRef.current.sarUp = su;
      }
      if (downF.length) {
        const sd = chart.addSeries(LineSeries, {
          color: '#ef5350',
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          pointMarkersVisible: true,
          pointMarkersRadius: 2.5,
          title: 'SAR ↓',
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        sd.setData(downF);
        indicatorSeriesRef.current.sarDown = sd;
      }
    }
    setDrawingApiVersion((previous) => previous + 1);
  }, [data, indicators]);

  return (
    <div className="chart-workspace" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      {loading && !data?.length && (
        <div className="chart-loading">
          <div className="spinner" />
          {loadingProgress || 'Loading chart data...'}
          {loadingProgress && <div className="loading-progress">{loadingProgress}</div>}
        </div>
      )}
      {!loading && !data?.length && emptyMessage && (
        <div className="chart-empty">{emptyMessage}</div>
      )}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
      />
      {countdown && priceCoord !== null && Number.isFinite(priceCoord) && (
        <div
          className="price-axis-countdown"
          style={{ top: `${priceCoord}px` }}
          title={`Sisa waktu candle ${timeframe}: ${countdown}`}
        >
          {countdown}
        </div>
      )}
      <ChartDrawingOverlay
        chart={drawingApi.chart}
        series={drawingApi.series}
        apiVersion={drawingApiVersion}
        drawingScope={drawingScope}
        drawings={drawings}
        mode={drawingMode}
        selectedDrawingId={selectedDrawingId}
        onModeChange={onDrawingModeChange}
        onAddDrawing={onAddDrawing}
        onSelectDrawing={onSelectDrawing}
        onDeleteDrawing={onDeleteDrawing}
        onUndo={onUndoDrawing}
        onRedo={onRedoDrawing}
        onDeleteSelected={onDeleteSelectedDrawing}
        onClear={onClearDrawings}
        canUndo={canUndoDrawing}
        canRedo={canRedoDrawing}
      />
    </div>
  );
});

export default Chart;
