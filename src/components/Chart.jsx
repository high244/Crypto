import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
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

const NOOP = () => {};

const Chart = forwardRef(function Chart({
  data,
  indicators,
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

  // Expose updateCandle to parent via ref
  useImperativeHandle(ref, () => ({
    updateCandle(candle) {
      if (candleSeriesRef.current) {
        candleSeriesRef.current.update({
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
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
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#2A2F3B',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    // Candlestick series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#3FA796',
      downColor: '#E06C5C',
      borderDownColor: '#E06C5C',
      borderUpColor: '#3FA796',
      wickDownColor: '#E06C5C',
      wickUpColor: '#3FA796',
    });

    // Volume series (v5 API)
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

  // Update data
  useEffect(() => {
    if (!candleSeriesRef.current || !data?.length) return;

    candleSeriesRef.current.setData(
      data.map((d) => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }))
    );
    volumeSeriesRef.current.setData(
      data.map((d) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(63, 167, 150, 0.35)' : 'rgba(224, 108, 92, 0.35)',
      }))
    );

    // Auto-fit to content
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
      setDrawingApiVersion((previous) => previous + 1);
    }
  }, [data]);

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
        indicatorSeriesRef.current.rsi = s;
        s.createPriceLine({ price: 70, color: 'rgba(239, 83, 80, 0.4)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
        s.createPriceLine({ price: 30, color: 'rgba(38, 166, 154, 0.4)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
      }
    }

    // MACD in separate pane
    if (indicators.macd) {
      const { macdLine, signalLine, histogram } = calcMACD(data, 12, 26, 9);
      const mF = macdLine.filter(Boolean);
      const sF = signalLine.filter(Boolean);
      const hF = histogram.filter(Boolean);
      if (mF.length) {
        const pane = indicators.rsi ? 2 : 1;
        const ml = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.macdLine, lineWidth: 1.5, title: 'MACD', priceScaleId: 'macd' }, pane);
        ml.setData(mF);
        indicatorSeriesRef.current.macdL = ml;
        const sl = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.signal, lineWidth: 1.5, title: 'Signal', priceScaleId: 'macd' }, pane);
        sl.setData(sF);
        indicatorSeriesRef.current.macdS = sl;
        const hs = chart.addSeries(HistogramSeries, { priceScaleId: 'macd', title: 'Hist' }, pane);
        hs.setData(hF);
        indicatorSeriesRef.current.macdH = hs;
      }
    }

    // Parabolic SAR overlay — scatter dots
    if (indicators.sar) {
      const { sarUp, sarDown } = calcParabolicSAR(data);
      const upF = sarUp.filter(Boolean);
      const downF = sarDown.filter(Boolean);
      if (upF.length) {
        const su = chart.addSeries(LineSeries, {
          color: '#3FA796',
          lineWidth: 0,
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
          color: '#E06C5C',
          lineWidth: 0,
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
      {loading && (
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
