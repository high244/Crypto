import { useRef, useEffect } from 'react';

export default function RecentTrades({ trades }) {
  const containerRef = useRef(null);

  // Auto-scroll to top when new trades come in
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [trades.length]);

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false });
  };

  const decimals = (trades[0]?.price || 0) < 1 ? 6 :
                   (trades[0]?.price || 0) < 100 ? 4 : 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="trades-header">
        <span>Price</span>
        <span style={{ textAlign: 'right' }}>Qty</span>
        <span style={{ textAlign: 'right' }}>Time</span>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }}>
        {trades.map((t) => (
          <div key={t.id} className="trade-row">
            <span className={`trade-price ${t.isBuyerMaker ? 'text-red' : 'text-green'}`}>
              {t.price.toFixed(decimals)}
            </span>
            <span className="trade-qty">
              {t.qty >= 1 ? t.qty.toFixed(4) : t.qty.toFixed(6)}
            </span>
            <span className="trade-time">{fmtTime(t.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
