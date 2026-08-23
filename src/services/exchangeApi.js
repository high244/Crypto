// Multi-exchange API service — Bybit v5 & OKX v5 public endpoints (no API key needed)
// Uses Vite proxy in dev mode to avoid CORS issues.

const BYBIT_BASE = import.meta.env.DEV
  ? '/bybit-api'
  : 'https://api.bybit.com';

const OKX_BASE = import.meta.env.DEV
  ? '/okx-api'
  : 'https://www.okx.com';

/**
 * Bybit interval mapping from our standard intervals
 */
const BYBIT_INTERVALS = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
  '1d': 'D', '1w': 'W', '1M': 'M',
};

/**
 * OKX bar mapping from our standard intervals
 */
const OKX_BARS = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
  '1d': '1D', '1w': '1W', '1M': '1M',
};

/**
 * Convert symbol to OKX instId format (e.g. "BTCUSDT" → "BTC-USDT")
 */
function toOKXInstId(symbol) {
  const s = symbol.toUpperCase().trim();
  if (s.includes('-')) return s;
  if (s.endsWith('USDT')) return s.slice(0, -4) + '-USDT';
  if (s.endsWith('USDC')) return s.slice(0, -4) + '-USDC';
  return s;
}

/**
 * Fetch kline data from Bybit v5 public API.
 * @param {string} symbol e.g. "BTCUSDT"
 * @param {string} interval e.g. "1h"
 * @param {number} limit max candles
 * @returns {Promise<Array<{time, open, high, low, close, volume}>>}
 */
export async function fetchBybitKline(symbol, interval = '1h', limit = 200) {
  const bybitInterval = BYBIT_INTERVALS[interval] || '60';
  const url = `${BYBIT_BASE}/v5/market/kline?category=spot&symbol=${symbol.toUpperCase().trim()}&interval=${bybitInterval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bybit HTTP ${res.status}`);
  const json = await res.json();
  if (json.retCode !== 0) throw new Error(json.retMsg || 'Bybit response error');
  const list = json.result?.list || [];
  if (!list.length) throw new Error('Bybit: data kosong');
  return list
    .map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .reverse(); // Bybit returns newest-first
}

/**
 * Fetch kline data from OKX v5 public API.
 * @param {string} symbol e.g. "BTCUSDT" (auto-converted to OKX format)
 * @param {string} interval e.g. "1h"
 * @param {number} limit max candles
 * @returns {Promise<Array<{time, open, high, low, close, volume}>>}
 */
export async function fetchOKXKline(symbol, interval = '1h', limit = 200) {
  const instId = toOKXInstId(symbol);
  const bar = OKX_BARS[interval] || '1H';
  const url = `${OKX_BASE}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OKX HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== '0') throw new Error(json.msg || 'OKX response error');
  const list = json.data || [];
  if (!list.length) throw new Error('OKX: data kosong');
  return list
    .map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .reverse(); // OKX returns newest-first
}

/**
 * Parse CSV text with OHLC data.
 * Expected columns: date,open,high,low,close
 * @param {string} raw CSV text
 * @returns {Array<{time, open, high, low, close, volume}>}
 */
export function parseCSVData(raw) {
  const lines = raw.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Data kosong.');
  const first = lines[0].split(',');
  const looksLikeHeader = isNaN(parseFloat(first[1]));
  const rows = looksLikeHeader ? lines.slice(1) : lines;
  const parsed = rows.map((line, idx) => {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 5) {
      throw new Error(`Baris ${idx + 1} tidak lengkap. Format: date,open,high,low,close`);
    }
    const [date, open, high, low, close] = parts;
    const nums = [open, high, low, close].map(Number);
    if (nums.some((n) => Number.isNaN(n))) {
      throw new Error(`Baris ${idx + 1} punya nilai yang bukan angka.`);
    }
    // Convert date string to unix timestamp
    const timestamp = Math.floor(new Date(date).getTime() / 1000);
    return {
      time: timestamp,
      open: nums[0],
      high: nums[1],
      low: nums[2],
      close: nums[3],
      volume: 0,
    };
  });
  if (parsed.length < 10) {
    throw new Error('Minimal butuh 10 baris data supaya indikator bisa dihitung.');
  }
  return parsed;
}
