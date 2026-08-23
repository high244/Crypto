import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DRAWING_TOOLS = [
  { type: 'select', label: 'Cursor / pilih objek', icon: 'cursor' },
  { type: 'trend', label: 'Trend line', icon: 'trend' },
  { type: 'ray', label: 'Ray', icon: 'ray' },
  { type: 'horizontal', label: 'Horizontal line', icon: 'horizontal' },
  { type: 'fib', label: 'Fibonacci retracement', icon: 'fib' },
  { type: 'rectangle', label: 'Rectangle', icon: 'rectangle' },
  { type: 'measure', label: 'Price range / measure', icon: 'measure' },
  { type: 'text', label: 'Text note', icon: 'text' },
  { type: 'long', label: 'Long position (Entry → TP → SL)', icon: 'long' },
  { type: 'short', label: 'Short position (Entry → TP → SL)', icon: 'short' },
  { type: 'eraser', label: 'Hapus objek di chart', icon: 'eraser' },
];

const DRAG_TOOLS = new Set(['trend', 'ray', 'fib', 'rectangle', 'measure']);
const POSITION_TOOLS = new Set(['long', 'short']);
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const EMPTY_DRAWINGS = Object.freeze([]);
const NOOP = () => {};

function createDrawingId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'drawing-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function asFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPrice(value) {
  const number = asFiniteNumber(value);
  if (number === null) return '—';
  const digits = Math.abs(number) < 1 ? 6 : Math.abs(number) < 100 ? 4 : 2;
  return number.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value) {
  const number = asFiniteNumber(value);
  if (number === null) return '—';
  return (number >= 0 ? '+' : '') + number.toFixed(2) + '%';
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getToolInstruction(mode, draft) {
  if (mode === 'select') return 'Pilih objek untuk menandai lalu hapus dengan tombol tempat sampah.';
  if (mode === 'eraser') return 'Klik objek pada chart untuk menghapusnya.';
  if (mode === 'long' || mode === 'short') {
    const step = draft?.points?.length || 0;
    if (step === 0) return (mode === 'long' ? 'Long' : 'Short') + ': klik harga Entry.';
    if (step === 1) return (mode === 'long' ? 'Long' : 'Short') + ': klik Target / TP.';
    return (mode === 'long' ? 'Long' : 'Short') + ': klik Stop Loss.';
  }
  if (mode === 'horizontal') return 'Klik chart untuk menambahkan horizontal line.';
  if (mode === 'text') return 'Klik chart untuk menambahkan catatan.';
  return 'Tarik di atas chart untuk menggambar ' + (DRAWING_TOOLS.find((tool) => tool.type === mode)?.label || 'objek') + '.';
}

function ToolIcon({ icon }) {
  const props = {
    width: 15,
    height: 15,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  switch (icon) {
    case 'cursor':
      return <svg {...props}><path d="m4 2 11 8-5.4 1.1L7.8 16 4 2Z" /><path d="m10 13 4 4" /></svg>;
    case 'trend':
      return <svg {...props}><path d="m3 15 5-5 3 2 6-7" /><circle cx="3" cy="15" r="1.3" /><circle cx="17" cy="3" r="1.3" /></svg>;
    case 'ray':
      return <svg {...props}><path d="m3 15 13-12" /><path d="M12 3h4v4" /><circle cx="3" cy="15" r="1.3" /></svg>;
    case 'horizontal':
      return <svg {...props}><path d="M2 10h16" /><circle cx="5" cy="10" r="1.3" /><circle cx="15" cy="10" r="1.3" /></svg>;
    case 'fib':
      return <svg {...props}><path d="M3 4h14M3 7h11M3 10h14M3 13h9M3 16h14" /><path d="M3 3v14" /></svg>;
    case 'rectangle':
      return <svg {...props}><rect x="3" y="4" width="14" height="12" rx="1" /></svg>;
    case 'measure':
      return <svg {...props}><path d="M4 16 16 4" /><path d="m5 12 3 3M8 9l3 3m0-6 3 3m0-6 2 2" /></svg>;
    case 'text':
      return <svg {...props}><path d="M4 4h12M10 4v12M7 16h6" /></svg>;
    case 'long':
      return <svg {...props}><path d="M10 17V3" /><path d="m5 8 5-5 5 5" /><path d="M4 17h12" /></svg>;
    case 'short':
      return <svg {...props}><path d="M10 3v14" /><path d="m5 12 5 5 5-5" /><path d="M4 3h12" /></svg>;
    case 'eraser':
      return <svg {...props}><path d="m5 14 7-9 5 4-7 8H5Z" /><path d="M4 17h12" /></svg>;
    case 'undo':
      return <svg {...props}><path d="M8 5 3 10l5 5" /><path d="M4 10h8a4 4 0 1 1 0 8" /></svg>;
    case 'redo':
      return <svg {...props}><path d="m12 5 5 5-5 5" /><path d="M16 10H8a4 4 0 1 0 0 8" /></svg>;
    case 'delete':
      return <svg {...props}><path d="M4 6h12M8 6V3h4v3m-6 0 1 11h6l1-11" /></svg>;
    case 'clear':
      return <svg {...props}><path d="M4 6h12M8 6V3h4v3m-6 0 1 11h6l1-11" /><path d="m5 15 10-10" /></svg>;
    default:
      return null;
  }
}

function DrawingToolRail({
  mode,
  onModeChange,
  selectedDrawingId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDeleteSelected,
  onClear,
}) {
  return (
    <aside className="drawing-tool-rail" aria-label="Alat gambar chart">
      <div className="drawing-tool-group">
        {DRAWING_TOOLS.map((tool) => (
          <button
            key={tool.type}
            className={'drawing-tool-button ' + (mode === tool.type ? 'active' : '') + (tool.type === 'long' ? ' tool-long' : '') + (tool.type === 'short' ? ' tool-short' : '')}
            onClick={() => onModeChange(tool.type)}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={mode === tool.type}
          >
            <ToolIcon icon={tool.icon} />
          </button>
        ))}
      </div>
      <div className="drawing-tool-divider" />
      <div className="drawing-tool-group">
        <button
          className="drawing-tool-button"
          onClick={onUndo}
          type="button"
          title="Undo gambar (Ctrl+Z)"
          aria-label="Undo gambar"
          disabled={!canUndo}
        >
          <ToolIcon icon="undo" />
        </button>
        <button
          className="drawing-tool-button"
          onClick={onRedo}
          type="button"
          title="Redo gambar (Ctrl+Y)"
          aria-label="Redo gambar"
          disabled={!canRedo}
        >
          <ToolIcon icon="redo" />
        </button>
        <button
          className="drawing-tool-button"
          onClick={onDeleteSelected}
          type="button"
          title="Hapus objek yang dipilih"
          aria-label="Hapus objek yang dipilih"
          disabled={!selectedDrawingId}
        >
          <ToolIcon icon="delete" />
        </button>
        <button
          className="drawing-tool-button danger"
          onClick={onClear}
          type="button"
          title="Hapus semua gambar pada chart ini"
          aria-label="Hapus semua gambar pada chart ini"
        >
          <ToolIcon icon="clear" />
        </button>
      </div>
    </aside>
  );
}

function DrawingLabel({ x, y, children, color = '#E8E6DF', anchor = 'start' }) {
  return (
    <text
      x={x}
      y={y}
      fill={color}
      fontFamily="var(--font-mono)"
      fontSize="10"
      fontWeight="600"
      paintOrder="stroke"
      stroke="#12141A"
      strokeWidth="3"
      strokeLinejoin="round"
      textAnchor={anchor}
      pointerEvents="none"
    >
      {children}
    </text>
  );
}

function PositionShape({ coordinates, type, width, height }) {
  if (coordinates.length < 3) {
    if (coordinates.length < 2) return null;
    return (
      <g opacity="0.75">
        <line
          x1={coordinates[0].x}
          y1={coordinates[0].y}
          x2={coordinates[1].x}
          y2={coordinates[1].y}
          stroke={type === 'long' ? '#3FA796' : '#E06C5C'}
          strokeWidth="2"
          strokeDasharray="5 4"
        />
      </g>
    );
  }

  const [entry, target, stop] = coordinates;
  const startX = Math.max(0, Math.min(entry.x, width - 16));
  const endX = Math.max(startX + 12, Math.min(width - 6, Math.max(entry.x + 120, target.x, stop.x)));
  const rewardTop = Math.min(entry.y, target.y);
  const rewardHeight = Math.max(1, Math.abs(entry.y - target.y));
  const riskTop = Math.min(entry.y, stop.y);
  const riskHeight = Math.max(1, Math.abs(entry.y - stop.y));
  const reward = Math.abs(target.price - entry.price);
  const risk = Math.abs(entry.price - stop.price);
  const ratio = risk > 0 ? reward / risk : null;
  const isLong = type === 'long';
  const valid = isLong
    ? target.price > entry.price && stop.price < entry.price
    : target.price < entry.price && stop.price > entry.price;
  const labelColor = valid ? (isLong ? '#3FA796' : '#E06C5C') : '#E8A33D';
  const maxLabelY = Math.max(13, height - 6);
  const targetLabelY = clamp(target.y < entry.y ? target.y + 14 : target.y - 6, 13, maxLabelY);
  const entryLabelY = clamp(entry.y - 5, 13, maxLabelY);
  const stopLabelY = clamp(stop.y > entry.y ? stop.y - 6 : stop.y + 14, 13, maxLabelY);

  return (
    <g>
      <rect x={startX} y={rewardTop} width={endX - startX} height={rewardHeight} fill="rgba(63, 167, 150, 0.20)" stroke="rgba(63, 167, 150, 0.65)" />
      <rect x={startX} y={riskTop} width={endX - startX} height={riskHeight} fill="rgba(224, 108, 92, 0.20)" stroke="rgba(224, 108, 92, 0.65)" />
      <line x1={startX} y1={entry.y} x2={endX} y2={entry.y} stroke="#E8E6DF" strokeWidth="1.2" strokeDasharray="4 3" />
      <DrawingLabel x={startX + 6} y={targetLabelY} color="#3FA796">
        {'TP  ' + formatPrice(target.price)}
      </DrawingLabel>
      <DrawingLabel x={startX + 6} y={entryLabelY} color="#E8E6DF">
        {'Entry  ' + formatPrice(entry.price)}
      </DrawingLabel>
      <DrawingLabel x={startX + 6} y={stopLabelY} color="#E06C5C">
        {'SL  ' + formatPrice(stop.price)}
      </DrawingLabel>
      <DrawingLabel x={endX - 5} y={entry.y - 5} color={labelColor} anchor="end">
        {(isLong ? 'LONG' : 'SHORT') + '  R:R ' + (ratio === null ? '—' : ratio.toFixed(2))}
      </DrawingLabel>
    </g>
  );
}

function DrawingShape({
  drawing,
  coordinates,
  width,
  height,
  selected,
  mode,
  onSelect,
  onDelete,
}) {
  if (!coordinates.length) return null;
  const preview = Boolean(drawing.preview);
  const interactive = !preview && (mode === 'select' || mode === 'eraser');
  const primary = selected ? '#F6C76A' : '#E8A33D';
  const groupProps = interactive
    ? {
      onPointerDown: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (mode === 'eraser') onDelete(drawing.id);
        else onSelect(drawing.id);
      },
      style: { cursor: mode === 'eraser' ? 'not-allowed' : 'pointer', pointerEvents: 'all' },
    }
    : { style: { pointerEvents: 'none' } };
  const lineProps = {
    stroke: primary,
    strokeWidth: selected ? 2.3 : 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    opacity: preview ? 0.72 : 1,
  };
  const [first, second] = coordinates;
  let graphic = null;

  if (drawing.type === 'trend' && second) {
    graphic = <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} {...lineProps} />;
  }

  if (drawing.type === 'ray' && second) {
    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;
    const isVertical = Math.abs(deltaX) < 0.5;
    const endX = isVertical ? first.x : (deltaX >= 0 ? width : 0);
    const endY = isVertical
      ? (deltaY >= 0 ? height : 0)
      : first.y + (deltaY / deltaX) * (endX - first.x);
    graphic = (
      <g>
        <line x1={first.x} y1={first.y} x2={endX} y2={endY} {...lineProps} markerEnd="url(#drawing-ray-arrow)" />
        <circle cx={first.x} cy={first.y} r="3" fill={primary} />
      </g>
    );
  }

  if (drawing.type === 'horizontal') {
    graphic = (
      <g>
        <line x1="0" y1={first.y} x2={width} y2={first.y} {...lineProps} strokeDasharray="5 4" />
        <DrawingLabel x={width - 7} y={first.y - 5} color={primary} anchor="end">{formatPrice(first.price)}</DrawingLabel>
      </g>
    );
  }

  if (drawing.type === 'fib' && second) {
    const fromX = Math.min(first.x, second.x);
    const toX = Math.max(fromX, Math.min(width - 4, Math.max(fromX + 12, first.x, second.x)));
    graphic = (
      <g opacity={preview ? 0.72 : 1}>
        {FIB_LEVELS.map((level) => {
          const price = first.price + (second.price - first.price) * level;
          const y = first.y + (second.y - first.y) * level;
          const highlighted = Math.abs(level - 0.618) < 0.001 || Math.abs(level - 0.5) < 0.001;
          return (
            <g key={level}>
              <line
                x1={fromX}
                y1={y}
                x2={toX}
                y2={y}
                stroke={highlighted ? '#F6C76A' : 'rgba(232, 163, 61, 0.62)'}
                strokeWidth={highlighted ? 1.5 : 1}
                strokeDasharray={level === 0 || level === 1 ? undefined : '4 3'}
              />
              <DrawingLabel x={fromX + 5} y={y - 4} color={highlighted ? '#F6C76A' : '#E8A33D'}>
                {(level * 100).toFixed(level === 0 || level === 1 ? 0 : 1) + '%  ' + formatPrice(price)}
              </DrawingLabel>
            </g>
          );
        })}
      </g>
    );
  }

  if (drawing.type === 'rectangle' && second) {
    const x = Math.min(first.x, second.x);
    const y = Math.min(first.y, second.y);
    graphic = <rect x={x} y={y} width={Math.abs(second.x - first.x)} height={Math.abs(second.y - first.y)} fill="rgba(232, 163, 61, 0.10)" {...lineProps} />;
  }

  if (drawing.type === 'measure' && second) {
    const x = Math.min(first.x, second.x);
    const y = Math.min(first.y, second.y);
    const percent = first.price ? ((second.price - first.price) / first.price) * 100 : null;
    const seconds = Math.abs(second.time - first.time);
    const timeText = seconds >= 86_400
      ? (seconds / 86_400).toFixed(1) + 'd'
      : seconds >= 3_600
        ? (seconds / 3_600).toFixed(1) + 'h'
        : Math.round(seconds / 60) + 'm';
    graphic = (
      <g>
        <rect x={x} y={y} width={Math.abs(second.x - first.x)} height={Math.abs(second.y - first.y)} fill="rgba(232, 163, 61, 0.08)" {...lineProps} strokeDasharray="4 3" />
        <DrawingLabel x={x + 5} y={Math.max(13, y + 14)} color="#F6C76A">
          {formatPercent(percent) + '  ·  ' + timeText}
        </DrawingLabel>
      </g>
    );
  }

  if (drawing.type === 'text') {
    graphic = <DrawingLabel x={first.x + 5} y={first.y - 5} color={primary}>{drawing.text || 'Catatan'}</DrawingLabel>;
  }

  if (POSITION_TOOLS.has(drawing.type)) {
    graphic = <PositionShape coordinates={coordinates} type={drawing.type} width={width} height={height} />;
  }

  if (!graphic) return null;
  const hitArea = (() => {
    if (!interactive) return null;

    if (drawing.type === 'horizontal') {
      return <rect x="0" y={first.y - 8} width={width} height="16" fill="transparent" pointerEvents="all" />;
    }

    if (drawing.type === 'text') {
      return <rect x={first.x - 6} y={first.y - 22} width="180" height="30" fill="transparent" pointerEvents="all" />;
    }

    const xs = coordinates.map((point) => point.x);
    const ys = coordinates.map((point) => point.y);
    const padding = 9;
    const left = Math.max(0, Math.min(...xs) - padding);
    const top = Math.max(0, Math.min(...ys) - padding);
    const right = Math.min(width, Math.max(...xs) + padding);
    const bottom = Math.min(height, Math.max(...ys) + padding);
    return <rect x={left} y={top} width={Math.max(1, right - left)} height={Math.max(1, bottom - top)} fill="transparent" pointerEvents="all" />;
  })();

  return (
    <g {...groupProps} className={'chart-drawing chart-drawing-' + drawing.type}>
      {hitArea}
      {graphic}
      {selected && !preview && coordinates.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r="3.5" fill="#12141A" stroke="#F6C76A" strokeWidth="1.5" />
      ))}
    </g>
  );
}

export default function ChartDrawingOverlay({
  chart,
  series,
  apiVersion,
  drawingScope,
  drawings = EMPTY_DRAWINGS,
  mode = 'select',
  selectedDrawingId = null,
  onModeChange = NOOP,
  onAddDrawing = NOOP,
  onSelectDrawing = NOOP,
  onDeleteDrawing = NOOP,
  onUndo = NOOP,
  onRedo = NOOP,
  onDeleteSelected = NOOP,
  onClear = NOOP,
  canUndo = false,
  canRedo = false,
}) {
  const svgRef = useRef(null);
  const viewportFrameRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewportVersion, setViewportVersion] = useState(0);

  const updateViewport = useCallback(() => {
    if (viewportFrameRef.current !== null) return;
    viewportFrameRef.current = window.requestAnimationFrame(() => {
      viewportFrameRef.current = null;
      setViewportVersion((previous) => previous + 1);
    });
  }, []);

  useEffect(() => {
    if (!chart || !series) return undefined;
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleTimeRangeChange(updateViewport);
    chart.subscribeCrosshairMove(updateViewport);
    series.subscribeDataChanged?.(updateViewport);
    updateViewport();
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(updateViewport);
      chart.unsubscribeCrosshairMove(updateViewport);
      series.unsubscribeDataChanged?.(updateViewport);
    };
  }, [chart, series, apiVersion, updateViewport]);

  useEffect(() => () => {
    if (viewportFrameRef.current !== null) {
      window.cancelAnimationFrame(viewportFrameRef.current);
    }
  }, []);

  useEffect(() => {
    const element = svgRef.current;
    if (!element) return undefined;
    const updateSize = () => {
      const next = element.getBoundingClientRect();
      setSize((previous) => (
        previous.width === next.width && previous.height === next.height
          ? previous
          : { width: next.width, height: next.height }
      ));
      updateViewport();
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    updateSize();
    return () => observer.disconnect();
  }, [apiVersion, updateViewport]);

  useEffect(() => {
    setDraft(null);
  }, [drawingScope, mode]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || event.target?.isContentEditable) return;
      if (event.key === 'Escape') {
        setDraft(null);
        onModeChange('select');
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        onRedo();
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDrawingId) {
        event.preventDefault();
        onDeleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeleteSelected, onModeChange, onRedo, onUndo, selectedDrawingId]);

  const pointFromEvent = useCallback((event) => {
    const svg = svgRef.current;
    if (!svg || !chart || !series) return null;
    const bounds = svg.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    if (typeof time !== 'number' || asFiniteNumber(price) === null) return null;
    return { time: Number(time), price: Number(price) };
  }, [chart, series]);

  const commitDrawing = useCallback((type, points, extras = {}) => {
    if (!points?.length) return;
    onAddDrawing({
      id: createDrawingId(),
      type,
      points,
      createdAt: Date.now(),
      ...extras,
    });
  }, [onAddDrawing]);

  const handlePointerDown = useCallback((event) => {
    if (mode === 'select' || mode === 'eraser') return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();

    if (mode === 'horizontal') {
      commitDrawing(mode, [point]);
      return;
    }

    if (mode === 'text') {
      const text = window.prompt('Teks catatan chart:', 'Catatan');
      if (text?.trim()) commitDrawing(mode, [point], { text: text.trim() });
      return;
    }

    if (POSITION_TOOLS.has(mode)) {
      if (!draft || draft.type !== mode) {
        setDraft({ type: mode, points: [point], pointer: point });
        return;
      }
      const points = [...draft.points, point];
      if (points.length >= 3) {
        commitDrawing(mode, points.slice(0, 3));
        setDraft(null);
      } else {
        setDraft({ ...draft, points, pointer: null });
      }
      return;
    }

    if (DRAG_TOOLS.has(mode)) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDraft({ type: mode, points: [point], pointer: point });
    }
  }, [commitDrawing, draft, mode, pointFromEvent]);

  const handlePointerMove = useCallback((event) => {
    if (!draft) return;
    const point = pointFromEvent(event);
    if (!point) return;
    setDraft((previous) => previous ? { ...previous, pointer: point } : null);
  }, [draft, pointFromEvent]);

  const handlePointerUp = useCallback((event) => {
    if (!draft || !DRAG_TOOLS.has(draft.type)) return;
    const point = pointFromEvent(event) || draft.pointer;
    if (point) commitDrawing(draft.type, [draft.points[0], point]);
    setDraft(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [commitDrawing, draft, pointFromEvent]);

  const preview = useMemo(() => {
    if (!draft) return null;
    const points = POSITION_TOOLS.has(draft.type)
      ? [...draft.points, ...(draft.pointer ? [draft.pointer] : [])].slice(0, 3)
      : [draft.points[0], draft.pointer].filter(Boolean);
    return { ...draft, id: 'draft', points, preview: true };
  }, [draft]);

  const pointToCoordinate = useCallback((point) => {
    void viewportVersion;
    if (!chart || !series || !point) return null;
    const x = chart.timeScale().timeToCoordinate(point.time);
    const y = series.priceToCoordinate(point.price);
    if (x === null || y === null) return null;
    return { x: Number(x), y: Number(y), time: point.time, price: point.price };
  }, [chart, series, viewportVersion]);

  const renderedDrawings = useMemo(() => {
    const all = preview ? [...drawings, preview] : drawings;
    return all
      .map((drawing) => {
        const coordinates = drawing.points.map(pointToCoordinate);
        return coordinates.some((point) => !point) ? null : { drawing, coordinates };
      })
      .filter(Boolean);
  }, [drawings, pointToCoordinate, preview]);

  const interactiveRoot = mode !== 'select' && mode !== 'eraser';
  const cursor = mode === 'text' ? 'text' : interactiveRoot ? 'crosshair' : 'default';

  return (
    <>
      <DrawingToolRail
        mode={mode}
        onModeChange={onModeChange}
        selectedDrawingId={selectedDrawingId}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onDeleteSelected={onDeleteSelected}
        onClear={onClear}
      />
      {mode !== 'select' && (
        <div className="drawing-tool-hint" aria-live="polite">
          {getToolInstruction(mode, draft)}
        </div>
      )}
      <svg
        ref={svgRef}
        className="chart-drawing-overlay"
        style={{ pointerEvents: interactiveRoot ? 'auto' : 'none', cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDraft(null)}
      >
        <defs>
          <marker id="drawing-ray-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#E8A33D" />
          </marker>
        </defs>
        {renderedDrawings.map(({ drawing, coordinates }) => (
          <DrawingShape
            key={drawing.id}
            drawing={drawing}
            coordinates={coordinates}
            width={size.width}
            height={size.height}
            selected={drawing.id === selectedDrawingId}
            mode={mode}
            onSelect={onSelectDrawing}
            onDelete={onDeleteDrawing}
          />
        ))}
      </svg>
    </>
  );
}
