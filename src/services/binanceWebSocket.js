// Binance WebSocket service — connects directly (no CORS issues for WS)
const WS_BASE = 'wss://data-stream.binance.vision/ws';

/**
 * Creates a managed WebSocket connection with auto-reconnect.
 * Returns an object with a `close()` method to cleanup.
 */
function createStream(endpoint, onMessage, onError) {
  let ws = null;
  let closed = false;
  let reconnectTimer = null;

  function connect() {
    if (closed) return;
    ws = new WebSocket(`${WS_BASE}/${endpoint}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onerror = (err) => {
      console.error('WS error:', endpoint, err);
      if (onError) onError(err);
    };

    ws.onclose = () => {
      if (!closed) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
  }

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    },
  };
}

/**
 * Subscribe to real-time kline (candlestick) updates.
 * @param {string} symbol e.g. "btcusdt" (lowercase)
 * @param {string} interval e.g. "1m"
 * @param {function} callback receives {time, open, high, low, close, volume, isClosed}
 * @returns {{close: function}} cleanup handle
 */
export function subscribeKline(symbol, interval, callback) {
  const sym = symbol.toLowerCase();
  return createStream(`${sym}@kline_${interval}`, (data) => {
    const k = data.k;
    callback({
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      isClosed: k.x,
    });
  });
}

/**
 * Subscribe to mini ticker (24h rolling stats).
 * @param {string} symbol e.g. "btcusdt"
 * @param {function} callback receives {symbol, close, open, high, low, volume, quoteVolume, change, changePct}
 * @returns {{close: function}}
 */
export function subscribeTicker(symbol, callback) {
  const sym = symbol.toLowerCase();
  return createStream(`${sym}@ticker`, (data) => {
    callback({
      symbol: data.s,
      close: parseFloat(data.c),
      open: parseFloat(data.o),
      high: parseFloat(data.h),
      low: parseFloat(data.l),
      volume: parseFloat(data.v),
      quoteVolume: parseFloat(data.q),
      change: parseFloat(data.p),
      changePct: parseFloat(data.P),
    });
  });
}

/**
 * Subscribe to aggregated trades.
 * @param {string} symbol e.g. "btcusdt"
 * @param {function} callback receives {id, price, qty, time, isBuyerMaker}
 * @returns {{close: function}}
 */
export function subscribeTrades(symbol, callback) {
  const sym = symbol.toLowerCase();
  return createStream(`${sym}@aggTrade`, (data) => {
    callback({
      id: data.a,
      price: parseFloat(data.p),
      qty: parseFloat(data.q),
      time: data.T,
      isBuyerMaker: data.m,
    });
  });
}

/**
 * Subscribe to partial book depth (top 20 levels, 1s updates).
 * @param {string} symbol
 * @param {function} callback receives {bids: [[price, qty]], asks: [[price, qty]]}
 * @returns {{close: function}}
 */
export function subscribeDepth(symbol, callback) {
  const sym = symbol.toLowerCase();
  return createStream(`${sym}@depth20@1000ms`, (data) => {
    callback({
      bids: data.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]),
      asks: data.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)]),
    });
  });
}
