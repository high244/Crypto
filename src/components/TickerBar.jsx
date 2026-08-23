export default function TickerBar({ ticker }) {
  if (!ticker) return <div className="ticker-bar" style={{ height: 52 }} />;

  const isUp = ticker.change >= 0;
  const color = isUp ? 'var(--green)' : 'var(--red)';
  const arrow = isUp ? '▲' : '▼';

  const fmt = (v, decimals = 2) => {
    if (v === undefined || v === null) return '-';
    return Number(v).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const fmtVol = (v) => {
    if (!v) return '-';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(2);
  };

  // Determine decimal places based on price magnitude
  const decimals = ticker.close < 1 ? 6 : ticker.close < 100 ? 4 : 2;

  return (
    <div className="ticker-bar">
      {/* Price */}
      <div className="ticker-price" style={{ color }}>
        {fmt(ticker.close, decimals)}
      </div>

      {/* 24h Change */}
      <div className="ticker-stat">
        <span className="ticker-stat-label">24h Change</span>
        <span className="ticker-stat-value" style={{ color }}>
          {arrow} {fmt(ticker.change, decimals)} ({ticker.changePct >= 0 ? '+' : ''}{fmt(ticker.changePct)}%)
        </span>
      </div>

      {/* 24h High */}
      <div className="ticker-stat">
        <span className="ticker-stat-label">24h High</span>
        <span className="ticker-stat-value">{fmt(ticker.high, decimals)}</span>
      </div>

      {/* 24h Low */}
      <div className="ticker-stat">
        <span className="ticker-stat-label">24h Low</span>
        <span className="ticker-stat-value">{fmt(ticker.low, decimals)}</span>
      </div>

      {/* 24h Volume */}
      <div className="ticker-stat">
        <span className="ticker-stat-label">24h Volume</span>
        <span className="ticker-stat-value">{fmtVol(ticker.volume)}</span>
      </div>

      {/* 24h Volume (Quote) */}
      <div className="ticker-stat">
        <span className="ticker-stat-label">24h Vol (USDT)</span>
        <span className="ticker-stat-value">{fmtVol(ticker.quoteVolume)}</span>
      </div>
    </div>
  );
}
