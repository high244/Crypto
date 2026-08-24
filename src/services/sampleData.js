const INTERVAL_SECONDS = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
  all: 24 * 60 * 60,
};

function sampleBasePrice(symbol = 'BTCUSDT') {
  const base = String(symbol || 'BTCUSDT').replace(/(USDT|USDC|USD)$/i, '');
  return {
    BTC: 65_000,
    ETH: 3_400,
    SOL: 150,
    BNB: 600,
    XRP: 0.55,
  }[base] || 10;
}

/** Deterministic illustrative candles for offline chart/indicator exploration. */
export function createSampleCandles(symbol = 'BTCUSDT', timeframe = '1h', count = 160) {
  const interval = INTERVAL_SECONDS[timeframe] || INTERVAL_SECONDS['1h'];
  const ending = Math.floor(Date.now() / 1000 / interval) * interval;
  const base = sampleBasePrice(symbol);
  let previousClose = base * 0.92;

  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index / 8) * 0.018 + Math.cos(index / 19) * 0.012;
    const drift = index * 0.00045;
    const open = previousClose;
    const close = base * (1 + drift + wave);
    const spread = base * (0.006 + Math.abs(Math.sin(index * 1.7)) * 0.008);
    previousClose = close;

    return {
      time: ending - (count - 1 - index) * interval,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
      close,
      volume: 0,
    };
  });
}
