import { useMemo } from 'react';

export default function OrderBook({ data }) {
  const { bids, asks, spread, spreadPct } = useMemo(() => {
    if (!data?.bids?.length || !data?.asks?.length) {
      return { bids: [], asks: [], spread: 0, spreadPct: 0 };
    }

    // Calculate cumulative totals
    let bidTotal = 0;
    const bids = data.bids.slice(0, 15).map(([price, qty]) => {
      bidTotal += qty;
      return { price, qty, total: bidTotal };
    });

    let askTotal = 0;
    const asks = data.asks.slice(0, 15).map(([price, qty]) => {
      askTotal += qty;
      return { price, qty, total: askTotal };
    });

    const maxTotal = Math.max(bidTotal, askTotal);
    bids.forEach((b) => (b.pct = (b.total / maxTotal) * 100));
    asks.forEach((a) => (a.pct = (a.total / maxTotal) * 100));

    const bestBid = data.bids[0]?.[0] || 0;
    const bestAsk = data.asks[0]?.[0] || 0;
    const spread = bestAsk - bestBid;
    const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

    return { bids, asks: asks.reverse(), spread, spreadPct };
  }, [data]);

  const decimals = (asks[0]?.price || bids[0]?.price || 0) < 1 ? 6 :
                   (asks[0]?.price || bids[0]?.price || 0) < 100 ? 4 : 2;

  const fmtP = (v) => v.toFixed(decimals);
  const fmtQ = (v) => {
    if (v >= 1000) return v.toFixed(2);
    if (v >= 1) return v.toFixed(4);
    return v.toFixed(6);
  };

  return (
    <div className="orderbook">
      <div className="orderbook-header">
        <span>Price</span>
        <span style={{ textAlign: 'right' }}>Qty</span>
        <span style={{ textAlign: 'right' }}>Total</span>
      </div>

      {/* Asks (sells) — reversed so lowest ask is at bottom */}
      {asks.map((a, i) => (
        <div key={`a-${i}`} className="orderbook-row">
          <div className="orderbook-bar ask" style={{ width: `${a.pct}%` }} />
          <span className="ob-price text-red">{fmtP(a.price)}</span>
          <span className="ob-qty">{fmtQ(a.qty)}</span>
          <span className="ob-total">{fmtQ(a.total)}</span>
        </div>
      ))}

      {/* Spread */}
      <div className="orderbook-spread">
        Spread:
        <span className="orderbook-spread-value">
          {fmtP(spread)} ({spreadPct.toFixed(3)}%)
        </span>
      </div>

      {/* Bids (buys) */}
      {bids.map((b, i) => (
        <div key={`b-${i}`} className="orderbook-row">
          <div className="orderbook-bar bid" style={{ width: `${b.pct}%` }} />
          <span className="ob-price text-green">{fmtP(b.price)}</span>
          <span className="ob-qty">{fmtQ(b.qty)}</span>
          <span className="ob-total">{fmtQ(b.total)}</span>
        </div>
      ))}
    </div>
  );
}
