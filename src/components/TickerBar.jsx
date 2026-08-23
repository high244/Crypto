function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, decimals = 2) {
  const number = asNumber(value);
  if (number === null) return '—';
  return number.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCompact(value, prefix = '') {
  const number = asNumber(value);
  if (number === null) return '—';
  if (number >= 1e12) return `${prefix}${(number / 1e12).toFixed(2)}T`;
  if (number >= 1e9) return `${prefix}${(number / 1e9).toFixed(2)}B`;
  if (number >= 1e6) return `${prefix}${(number / 1e6).toFixed(2)}M`;
  if (number >= 1e3) return `${prefix}${(number / 1e3).toFixed(2)}K`;
  return `${prefix}${number.toFixed(2)}`;
}

function formatFundingRate(rate) {
  const number = asNumber(rate);
  if (number === null) return '—';
  const percentage = number * 100;
  const decimals = Math.abs(percentage) < 0.01 ? 4 : 3;
  return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(decimals)}%`;
}

export default function TickerBar({ ticker, market, fundingRate, openInterest }) {
  const close = asNumber(ticker?.close);
  const change = asNumber(ticker?.change);
  const changePct = asNumber(ticker?.changePct);
  const isUp = (change ?? changePct ?? 0) >= 0;
  const color = isUp ? 'var(--green)' : 'var(--red)';
  const arrow = isUp ? '▲' : '▼';
  const decimals = close === null ? 2 : close < 1 ? 6 : close < 100 ? 4 : 2;
  const fundingNumber = asNumber(fundingRate);

  return (
    <div className="ticker-bar">
      <div className="ticker-price" style={{ color: close === null ? 'var(--text-muted)' : color }}>
        {formatNumber(close, decimals)}
      </div>

      <div className="ticker-stat">
        <span className="ticker-stat-label">24h Change</span>
        <span className="ticker-stat-value" style={{ color }}>
          {change === null && changePct === null
            ? '—'
            : `${arrow} ${formatNumber(change, decimals)} (${changePct !== null && changePct >= 0 ? '+' : ''}${formatNumber(changePct)}%)`}
        </span>
      </div>

      <div className="ticker-stat">
        <span className="ticker-stat-label">24h High</span>
        <span className="ticker-stat-value">{formatNumber(ticker?.high, decimals)}</span>
      </div>

      <div className="ticker-stat">
        <span className="ticker-stat-label">24h Low</span>
        <span className="ticker-stat-value">{formatNumber(ticker?.low, decimals)}</span>
      </div>

      <div className="ticker-stat">
        <span className="ticker-stat-label">24h Vol (USD)</span>
        <span className="ticker-stat-value">{formatCompact(ticker?.quoteVolume, '$')}</span>
      </div>

      {market === 'futures' && (
        <>
          <div className="ticker-stat futures-stat">
            <span className="ticker-stat-label">Funding Rate</span>
            <span
              className="ticker-stat-value"
              style={{ color: fundingNumber === null ? 'var(--text-muted)' : fundingNumber >= 0 ? 'var(--green)' : 'var(--red)' }}
            >
              {formatFundingRate(fundingRate)}
            </span>
          </div>
          <div className="ticker-stat futures-stat">
            <span className="ticker-stat-label">Open Interest</span>
            <span className="ticker-stat-value">{formatCompact(openInterest, '$')}</span>
          </div>
        </>
      )}
    </div>
  );
}
