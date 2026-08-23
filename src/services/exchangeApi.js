// Manual CSV parsing remains available when every live market source fails.

/**
 * Parse CSV text with OHLC data.
 * Expected columns: date,open,high,low,close
 * @param {string} raw CSV text
 * @returns {Array<{time, open, high, low, close, volume}>}
 */
export function parseCSVData(raw) {
  const lines = raw.trim().split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Data kosong.');

  const first = lines[0].split(',');
  const looksLikeHeader = Number.isNaN(parseFloat(first[1]));
  const rows = looksLikeHeader ? lines.slice(1) : lines;
  const parsed = rows.map((line, index) => {
    const parts = line.split(',').map((part) => part.trim());
    if (parts.length < 5) {
      throw new Error(`Baris ${index + 1} tidak lengkap. Format: date,open,high,low,close`);
    }

    const [date, open, high, low, close] = parts;
    const values = [open, high, low, close].map(Number);
    if (values.some((value) => Number.isNaN(value))) {
      throw new Error(`Baris ${index + 1} punya nilai yang bukan angka.`);
    }

    const time = Math.floor(new Date(date).getTime() / 1000);
    if (!Number.isFinite(time)) {
      throw new Error(`Baris ${index + 1} punya tanggal yang tidak valid.`);
    }

    return {
      time,
      open: values[0],
      high: values[1],
      low: values[2],
      close: values[3],
      volume: 0,
    };
  });

  if (parsed.length < 10) {
    throw new Error('Minimal butuh 10 baris data supaya indikator bisa dihitung.');
  }

  return parsed.sort((a, b) => a.time - b.time);
}
