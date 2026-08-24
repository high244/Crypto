import { toHyperliquidInterval } from './hyperliquidApi';

const WS_URL = 'wss://api.hyperliquid.xyz/ws';

function createSubscription(subscription, onData, onError) {
  let socket = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let closed = false;

  const clearTimers = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    reconnectTimer = null;
    heartbeatTimer = null;
  };

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      socket.send(JSON.stringify({ method: 'subscribe', subscription }));
      // Hyperliquid closes quiet sockets after 60 seconds.
      heartbeatTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ method: 'ping' }));
      }, 30_000);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.channel === 'subscriptionResponse' || message.channel === 'pong') return;
        onData(message.data);
      } catch (error) {
        console.error('Hyperliquid WebSocket parse error:', error);
      }
    };

    socket.onerror = (error) => {
      if (!closed) onError?.(error);
    };

    socket.onclose = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      if (!closed) reconnectTimer = setTimeout(connect, 3_000);
    };
  };

  connect();

  return {
    close() {
      closed = true;
      clearTimers();
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    },
  };
}

export function subscribeHyperliquidCandle(coin, timeframe, callback, onError) {
  return createSubscription(
    { type: 'candle', coin, interval: toHyperliquidInterval(timeframe) },
    (candle) => {
      if (!candle?.t) return;
      callback({
        time: Math.floor(Number(candle.t) / 1000),
        open: Number(candle.o),
        high: Number(candle.h),
        low: Number(candle.l),
        close: Number(candle.c),
        volume: Number(candle.v),
      });
    },
    onError
  );
}

export function subscribeHyperliquidAssetContext(coin, callback, onError) {
  return createSubscription(
    { type: 'activeAssetCtx', coin },
    (payload) => {
      if (!payload?.ctx) return;
      callback(payload.ctx);
    },
    onError
  );
}

export function subscribeHyperliquidDepth(coin, callback, onError) {
  return createSubscription(
    { type: 'l2Book', coin },
    (book) => {
      if (!Array.isArray(book?.levels)) return;
      const rawBids = book.levels[0] || [];
      const rawAsks = book.levels[1] || [];
      callback({
        bids: rawBids.slice(0, 20).map((lvl) => [Number(lvl.px), Number(lvl.sz)]),
        asks: rawAsks.slice(0, 20).map((lvl) => [Number(lvl.px), Number(lvl.sz)]),
      });
    },
    onError
  );
}

export function subscribeHyperliquidTrades(coin, callback, onError) {
  return createSubscription(
    { type: 'trades', coin },
    (trades) => {
      if (!Array.isArray(trades)) return;
      trades.forEach((trade) => {
        callback({
          id: trade.hash || `${trade.time}-${trade.px}-${trade.sz}`,
          price: Number(trade.px),
          qty: Number(trade.sz),
          time: Number(trade.time),
          isBuyerMaker: trade.side === 'A',
        });
      });
    },
    onError
  );
}

