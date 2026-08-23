import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

const STORAGE_KEY = 'conflux.chart-drawings.v1';
const MAX_HISTORY_ITEMS = 50;
const EMPTY_DRAWINGS = Object.freeze([]);
const EMPTY_HISTORY = Object.freeze({ past: EMPTY_DRAWINGS, future: EMPTY_DRAWINGS });

function normalizeMarket(market) {
  return market === 'futures' ? 'futures' : 'spot';
}

function normalizeSymbol(symbol) {
  return String(symbol || '').toUpperCase().replace(/\s+/g, '');
}

function isPersistedDrawing(drawing) {
  return (
    drawing
    && typeof drawing.id === 'string'
    && typeof drawing.type === 'string'
    && Array.isArray(drawing.points)
    && drawing.points.length > 0
    && drawing.points.every((point) => Number.isFinite(Number(point?.time)) && Number.isFinite(Number(point?.price)))
  );
}

function readStoredDrawings() {
  if (typeof window === 'undefined') return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, drawings]) => Array.isArray(drawings))
        .map(([scope, drawings]) => [scope, drawings.filter(isPersistedDrawing)])
    );
  } catch {
    return {};
  }
}

function createInitialState() {
  return {
    drawingsByScope: readStoredDrawings(),
    historyByScope: {},
  };
}

function historyFor(state, scope) {
  return state.historyByScope[scope] || EMPTY_HISTORY;
}

function withTrackedChange(state, scope, nextDrawings) {
  const currentDrawings = state.drawingsByScope[scope] || EMPTY_DRAWINGS;
  if (nextDrawings === currentDrawings) return state;

  const currentHistory = historyFor(state, scope);
  const nextHistory = {
    past: [...currentHistory.past, currentDrawings].slice(-MAX_HISTORY_ITEMS),
    future: EMPTY_DRAWINGS,
  };

  return {
    drawingsByScope: { ...state.drawingsByScope, [scope]: nextDrawings },
    historyByScope: { ...state.historyByScope, [scope]: nextHistory },
  };
}

/** Exported for deterministic tests of add/delete/undo/redo behavior. */
export function chartDrawingReducer(state, action) {
  const scope = action.scope;
  const currentDrawings = state.drawingsByScope[scope] || EMPTY_DRAWINGS;

  switch (action.type) {
    case 'add':
      return withTrackedChange(state, scope, [...currentDrawings, action.drawing]);

    case 'delete': {
      const nextDrawings = currentDrawings.filter((drawing) => drawing.id !== action.id);
      return nextDrawings.length === currentDrawings.length
        ? state
        : withTrackedChange(state, scope, nextDrawings);
    }

    case 'clear':
      return currentDrawings.length ? withTrackedChange(state, scope, EMPTY_DRAWINGS) : state;

    case 'undo': {
      const currentHistory = historyFor(state, scope);
      if (!currentHistory.past.length) return state;
      const previousDrawings = currentHistory.past.at(-1);
      return {
        drawingsByScope: { ...state.drawingsByScope, [scope]: previousDrawings },
        historyByScope: {
          ...state.historyByScope,
          [scope]: {
            past: currentHistory.past.slice(0, -1),
            future: [currentDrawings, ...currentHistory.future].slice(0, MAX_HISTORY_ITEMS),
          },
        },
      };
    }

    case 'redo': {
      const currentHistory = historyFor(state, scope);
      if (!currentHistory.future.length) return state;
      const nextDrawings = currentHistory.future[0];
      return {
        drawingsByScope: { ...state.drawingsByScope, [scope]: nextDrawings },
        historyByScope: {
          ...state.historyByScope,
          [scope]: {
            past: [...currentHistory.past, currentDrawings].slice(-MAX_HISTORY_ITEMS),
            future: currentHistory.future.slice(1),
          },
        },
      };
    }

    default:
      return state;
  }
}

/**
 * Keeps drawings local to a market/pair, gives the UI undo/redo controls, and
 * persists the committed objects in the browser without needing an API key.
 */
export function useChartDrawings(symbol, market) {
  const drawingScope = useMemo(
    () => `${normalizeMarket(market)}:${normalizeSymbol(symbol)}`,
    [market, symbol]
  );
  const [state, dispatch] = useReducer(chartDrawingReducer, undefined, createInitialState);
  const [drawingMode, setDrawingMode] = useState('select');
  const [selectedDrawingIdState, setSelectedDrawingIdState] = useState(null);
  const drawings = state.drawingsByScope[drawingScope] || EMPTY_DRAWINGS;
  const history = historyFor(state, drawingScope);
  const selectedDrawingId = drawings.some((drawing) => drawing.id === selectedDrawingIdState)
    ? selectedDrawingIdState
    : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.drawingsByScope));
    } catch {
      // Local storage can be unavailable or full. Drawing still works during
      // this session, which is safer than interrupting chart interaction.
    }
  }, [state.drawingsByScope]);

  const addDrawing = useCallback((drawing) => {
    if (!isPersistedDrawing(drawing)) return;
    dispatch({ type: 'add', scope: drawingScope, drawing });
    setSelectedDrawingIdState(drawing.id);
  }, [drawingScope]);

  const selectDrawing = useCallback((id) => {
    setSelectedDrawingIdState(id || null);
  }, []);

  const deleteDrawing = useCallback((id) => {
    if (!id) return;
    dispatch({ type: 'delete', scope: drawingScope, id });
    setSelectedDrawingIdState((selectedId) => (selectedId === id ? null : selectedId));
  }, [drawingScope]);

  const deleteSelectedDrawing = useCallback(() => {
    if (selectedDrawingId) deleteDrawing(selectedDrawingId);
  }, [deleteDrawing, selectedDrawingId]);

  const clearDrawings = useCallback(() => {
    dispatch({ type: 'clear', scope: drawingScope });
    setSelectedDrawingIdState(null);
  }, [drawingScope]);

  const undoDrawing = useCallback(() => {
    dispatch({ type: 'undo', scope: drawingScope });
    setSelectedDrawingIdState(null);
  }, [drawingScope]);

  const redoDrawing = useCallback(() => {
    dispatch({ type: 'redo', scope: drawingScope });
    setSelectedDrawingIdState(null);
  }, [drawingScope]);

  const changeDrawingMode = useCallback((nextMode) => {
    setDrawingMode(nextMode || 'select');
    if (nextMode !== 'select') setSelectedDrawingIdState(null);
  }, []);

  return {
    drawingScope,
    drawings,
    drawingMode,
    selectedDrawingId,
    onDrawingModeChange: changeDrawingMode,
    onAddDrawing: addDrawing,
    onSelectDrawing: selectDrawing,
    onDeleteDrawing: deleteDrawing,
    onUndoDrawing: undoDrawing,
    onRedoDrawing: redoDrawing,
    onDeleteSelectedDrawing: deleteSelectedDrawing,
    onClearDrawings: clearDrawings,
    canUndoDrawing: history.past.length > 0,
    canRedoDrawing: history.future.length > 0,
  };
}
