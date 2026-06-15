import YahooFinance from "yahoo-finance2";
import { ANALYSIS_CACHE_TTL_MS, getCached, setCached } from "@/lib/cache";
import type { IndicatorSnapshot } from "@/lib/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

type OhlcRow = {
  date: Date;
  close: number;
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
      typeof row.close === "number" &&
      Number.isFinite(row.close),
  );

  const sorted = [...history].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const closes = sorted.map((row) => row.close);
  const currentPrice = closes.at(-1) ?? null;
  const sma20 = computeSma(closes, 20);
  const sma50 = computeSma(closes, 50);
  const sma200 = computeSma(closes, 200);
  const rsi14 = computeRsi(closes, 14);

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
    sma200,
    rsi14,
    change30d,
    trend:
      currentPrice !== null
        ? trendFromPrice(currentPrice, sma20, sma50)
        : "neutral",
    fetchedAt: new Date().toISOString(),
  };

  setCached(cacheKey, snapshot, ANALYSIS_CACHE_TTL_MS);
  return snapshot;
}
