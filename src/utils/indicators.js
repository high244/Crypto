// Technical indicators — pure computation functions
// All take an array of candle objects {close, high, low} and return arrays of values.

/**
 * Simple Moving Average
 * @param {Array<{close:number}>} data
 * @param {number} period
 * @returns {Array<{time:number, value:number}|null>}
 */
export function calcSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    result.push({ time: data[i].time, value: +(sum / period).toFixed(6) });
  }
  return result;
}

/**
 * Exponential Moving Average
 */
export function calcEMA(data, period) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (ema === null) {
      // Seed with SMA
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
      ema = sum / period;
    } else {
      ema = data[i].close * k + ema * (1 - k);
    }
    result.push({ time: data[i].time, value: +ema.toFixed(6) });
  }
  return result;
}

/**
 * Bollinger Bands (upper, middle SMA, lower)
 */
export function calcBollingerBands(data, period = 20, stdDevMultiplier = 2) {
  const upper = [];
  const middle = [];
  const lower = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      middle.push(null);
      lower.push(null);
      continue;
    }
    let sum = 0;
    const slice = [];
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close;
      slice.push(data[j].close);
    }
    const sma = sum / period;
    const variance = slice.reduce((acc, v) => acc + (v - sma) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);

    middle.push({ time: data[i].time, value: +sma.toFixed(6) });
    upper.push({ time: data[i].time, value: +(sma + stdDevMultiplier * stdDev).toFixed(6) });
    lower.push({ time: data[i].time, value: +(sma - stdDevMultiplier * stdDev).toFixed(6) });
  }
  return { upper, middle, lower };
}

/**
 * Relative Strength Index
 */
export function calcRSI(data, period = 14) {
  const result = [];

  if (data.length < period + 1) {
    return data.map(() => null);
  }

  let gains = 0;
  let losses = 0;

  // First period: simple average
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
    result.push(null);
  }
  // Push the first result (we already have `period` nulls for indices 0 to period-1)
  // Wait — we pushed `period` nulls for indices 1..period but need index 0 too.
  // Let me redo this more carefully:

  const out = new Array(data.length).fill(null);
  gains = 0;
  losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  out[period] = { time: data[period].time, value: +(100 - 100 / (1 + rs)).toFixed(2) };

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out[i] = { time: data[i].time, value: +(100 - 100 / (1 + rs)).toFixed(2) };
  }

  return out;
}

/**
 * MACD (Moving Average Convergence/Divergence)
 * Returns { macdLine, signalLine, histogram } arrays
 */
export function calcMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = calcEMAValues(data.map((d) => d.close), fastPeriod);
  const slowEMA = calcEMAValues(data.map((d) => d.close), slowPeriod);

  const macdLine = [];
  for (let i = 0; i < data.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }

  // Signal line = EMA of MACD line
  const macdValues = macdLine.filter((v) => v !== null);
  const signalEMA = calcEMAValues(macdValues, signalPeriod);

  const out = {
    macdLine: new Array(data.length).fill(null),
    signalLine: new Array(data.length).fill(null),
    histogram: new Array(data.length).fill(null),
  };

  let si = 0;
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] === null) continue;
    const sig = signalEMA[si] ?? null;
    out.macdLine[i] = { time: data[i].time, value: +macdLine[i].toFixed(6) };
    if (sig !== null) {
      out.signalLine[i] = { time: data[i].time, value: +sig.toFixed(6) };
      out.histogram[i] = {
        time: data[i].time,
        value: +(macdLine[i] - sig).toFixed(6),
        color: macdLine[i] - sig >= 0 ? '#26a69a' : '#ef5350',
      };
    }
    si++;
  }

  return out;
}

/** Internal: compute EMA from raw number array (not objects) */
function calcEMAValues(values, period) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = null;

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (ema === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      ema = sum / period;
    } else {
      ema = values[i] * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
}
