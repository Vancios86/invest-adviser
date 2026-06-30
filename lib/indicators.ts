import { yahooFinance } from "@/lib/yahoo";
import { ANALYSIS_CACHE_TTL_MS, getCached, setCached } from "@/lib/cache";
import { isUnusualVolume } from "@/lib/volume-utils";
import type { IndicatorSnapshot } from "@/lib/types";

type OhlcRow = {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function computeSma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

function computeRsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeBuyVolumePct(rows: OhlcRow[], period = 20): number | null {
  if (rows.length < period + 1) return null;

  const window = rows.slice(-(period + 1));
  let buyVolume = 0;
  let sellVolume = 0;

  for (let i = 1; i < window.length; i += 1) {
    const prev = window[i - 1];
    const current = window[i];
    if (current.close > prev.close) buyVolume += current.volume;
    else if (current.close < prev.close) sellVolume += current.volume;
    else {
      buyVolume += current.volume / 2;
      sellVolume += current.volume / 2;
    }
  }

  const total = buyVolume + sellVolume;
  if (total <= 0) return null;
  return (buyVolume / total) * 100;
}

function computeCmf(rows: OhlcRow[], period = 20): number | null {
  if (rows.length < period) return null;

  const window = rows.slice(-period);
  let moneyFlowVolume = 0;
  let totalVolume = 0;

  for (const row of window) {
    const range = row.high - row.low;
    const multiplier =
      range === 0 ? 0 : (row.close - row.low - (row.high - row.close)) / range;
    moneyFlowVolume += multiplier * row.volume;
    totalVolume += row.volume;
  }

  if (totalVolume <= 0) return null;
  return moneyFlowVolume / totalVolume;
}

function computeRelativeVolume(rows: OhlcRow[], period = 20): number | null {
  if (rows.length < period + 1) return null;

  const latest = rows.at(-1);
  if (!latest || latest.volume <= 0) return null;

  const avgVolume = computeSma(
    rows.slice(-(period + 1), -1).map((row) => row.volume),
    period,
  );
  if (avgVolume === null || avgVolume <= 0) return null;
  return latest.volume / avgVolume;
}

function volumeSignalFromMetrics(
  buyVolumePct20: number | null,
  cmf20: number | null,
): IndicatorSnapshot["volumeSignal"] {
  let score = 0;

  if (buyVolumePct20 !== null) {
    if (buyVolumePct20 >= 58) score += 1;
    else if (buyVolumePct20 <= 42) score -= 1;
  }

  if (cmf20 !== null) {
    if (cmf20 >= 0.08) score += 1;
    else if (cmf20 <= -0.08) score -= 1;
  }

  if (score >= 1) return "buying";
  if (score <= -1) return "selling";
  return "neutral";
}

function detectRecentPanicSell(rows: OhlcRow[]): boolean {
  if (rows.length < 25) return false;

  const window = rows.slice(-5);
  for (let i = 0; i < window.length; i += 1) {
    const rowIndex = rows.length - 5 + i;
    const row = window[i]!;
    const prev = rows[rowIndex - 1];
    if (!prev || prev.close <= 0) continue;

    const dayChangePct = ((row.close - prev.close) / prev.close) * 100;
    if (dayChangePct > -2) continue;

    const avgVolume = computeSma(
      rows.slice(rowIndex - 20, rowIndex).map((r) => r.volume),
      20,
    );
    if (avgVolume === null || avgVolume <= 0) continue;

    if (row.volume / avgVolume >= 1.3) return true;
  }

  return false;
}

function computeHigh20d(closes: number[]): number | null {
  if (closes.length < 20) return null;
  return Math.max(...closes.slice(-20));
}

function trendFromPrice(
  price: number,
  sma20: number | null,
  sma50: number | null,
): IndicatorSnapshot["trend"] {
  if (sma20 === null || sma50 === null) return "neutral";
  if (price > sma20 && sma20 > sma50) return "bullish";
  if (price < sma20 && sma20 < sma50) return "bearish";
  return "neutral";
}

export async function fetchIndicators(
  symbol: string,
): Promise<IndicatorSnapshot> {
  const normalized = symbol.trim().toUpperCase();
  const cacheKey = `indicators:${normalized}`;
  const cached = getCached<IndicatorSnapshot>(cacheKey);
  if (cached) return cached;

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 1);
  const period2 = new Date();

  const chart = await yahooFinance.chart(normalized, {
    period1,
    period2,
    interval: "1d",
  });

  const history = (chart.quotes ?? []).filter(
    (row): row is OhlcRow =>
      row.date instanceof Date &&
      typeof row.open === "number" &&
      typeof row.high === "number" &&
      typeof row.low === "number" &&
      typeof row.close === "number" &&
      typeof row.volume === "number" &&
      Number.isFinite(row.open) &&
      Number.isFinite(row.high) &&
      Number.isFinite(row.low) &&
      Number.isFinite(row.close) &&
      Number.isFinite(row.volume) &&
      row.volume >= 0,
  );

  const sorted = [...history].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const closes = sorted.map((row) => row.close);
  const currentPrice = closes.at(-1) ?? null;
  const sma20 = computeSma(closes, 20);
  const sma50 = computeSma(closes, 50);
  const sma150 = computeSma(closes, 150);
  const sma200 = computeSma(closes, 200);
  const sma150Prior =
    closes.length >= 170 ? computeSma(closes.slice(0, -20), 150) : null;
  const sma150SlopePct =
    sma150 !== null && sma150Prior !== null && sma150Prior > 0
      ? ((sma150 - sma150Prior) / sma150Prior) * 100
      : null;
  const high20d = computeHigh20d(closes);
  const drawdownFromHigh20Pct =
    currentPrice !== null && high20d !== null && high20d > 0
      ? ((currentPrice - high20d) / high20d) * 100
      : null;
  const rsi14 = computeRsi(closes, 14);
  const buyVolumePct20 = computeBuyVolumePct(sorted, 20);
  const cmf20 = computeCmf(sorted, 20);
  const relativeVolume = computeRelativeVolume(sorted, 20);
  const recentPanicSell = detectRecentPanicSell(sorted);

  const change30d =
    closes.length >= 22 && currentPrice !== null
      ? ((currentPrice - closes[closes.length - 22]) / closes[closes.length - 22]) *
        100
      : null;

  const snapshot: IndicatorSnapshot = {
    symbol: normalized,
    currentPrice,
    sma20,
    sma50,
    sma150,
    sma200,
    sma150SlopePct,
    high20d,
    drawdownFromHigh20Pct,
    rsi14,
    change30d,
    buyVolumePct20,
    cmf20,
    relativeVolume,
    unusualVolume: isUnusualVolume(relativeVolume),
    recentPanicSell,
    volumeSignal: volumeSignalFromMetrics(buyVolumePct20, cmf20),
    trend:
      currentPrice !== null
        ? trendFromPrice(currentPrice, sma20, sma50)
        : "neutral",
    fetchedAt: new Date().toISOString(),
  };

  setCached(cacheKey, snapshot, ANALYSIS_CACHE_TTL_MS);
  return snapshot;
}
