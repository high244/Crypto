import { useState, useEffect } from 'react';
import { subscribeTicker } from '../services/binanceWebSocket';
import { fetchTicker24h } from '../services/binanceApi';

const POPULAR_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
  'LINKUSDT', 'NEARUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT',
  'ARBUSDT', 'OPUSDT', 'APTUSDT', 'SUIUSDT', 'PEPEUSDT',
];

export default function Watchlist({ activeSymbol, onSelect, market = 'spot' }) {
  const [tickers, setTickers] = useState({});

  // 1. Initial REST snapshot + 2. Real-time WebSocket subscriptions
  useEffect(() => {
    let cancelled = false;

    // Load initial snapshot so prices appear instantly
    POPULAR_PAIRS.forEach((pair) => {
      fetchTicker24h(pair)
        .then((data) => {
          if (cancelled || !data?.lastPrice) return;
          setTickers((prev) => {
            // Only set if not already updated by WebSocket
            if (prev[pair] && prev[pair]._ws) return prev;
            return {
              ...prev,
              [pair]: {
                symbol: pair,
                close: parseFloat(data.lastPrice),
                change: parseFloat(data.priceChange),
                changePct: parseFloat(data.priceChangePercent),
                high: parseFloat(data.highPrice),
                low: parseFloat(data.lowPrice),
                volume: parseFloat(data.volume),
                _rest: true,
              },
            };
          });
        })
        .catch(() => {});
    });

    // Subscribe to live WebSocket tick-by-tick stream
    const subs = POPULAR_PAIRS.map((pair) =>
      subscribeTicker(pair, (data) => {
        if (cancelled) return;
        setTickers((prev) => ({
          ...prev,
          [pair]: { ...data, _ws: true },
        }));
      }, market)
    );

    return () => {
      cancelled = true;
      subs.forEach((s) => s.close());
    };
  }, [market]);

  return (
    <>
      <div className="panel-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Watchlist · {market === 'futures' ? 'Perp' : 'Spot'}
        </span>
      </div>
      <div className="panel-body">
        {POPULAR_PAIRS.map((pair) => {
          const t = tickers[pair];
          const base = pair.replace('USDT', '');
          const isUp = t ? t.changePct >= 0 : true;
          const color = isUp ? 'var(--green)' : 'var(--red)';
          const decimals = t && t.close < 1 ? 6 : t && t.close < 100 ? 4 : 2;

          return (
            <div
              key={pair}
              className={`watchlist-item ${activeSymbol === pair ? 'active' : ''}`}
              onClick={() => onSelect(pair)}
            >
              <div className="watchlist-symbol">
                <span className="watchlist-base">{base}</span>
                <span className="watchlist-quote">/USDT</span>
              </div>
              <div className="watchlist-right">
                <div className="watchlist-price" style={{ color: t ? color : 'var(--text-secondary)' }}>
                  {t ? t.close.toFixed(decimals) : '…'}
                </div>
                <div className="watchlist-change" style={{ color }}>
                  {t ? `${isUp ? '+' : ''}${t.changePct.toFixed(2)}%` : '…'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
