import { yahooFinance } from "@/lib/yahoo";
import { ANALYSIS_CACHE_TTL_MS, getCached, setCached } from "@/lib/cache";
import { computeRelativeVolume } from "@/lib/volume-utils";
import type { ScreenerSource, VolumeCandidate } from "@/lib/types";

type ScreenerQuote = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  averageDailyVolume10Day?: number;
  marketCap?: number;
  quoteType?: string;
};

const SOURCES: ScreenerSource[] = [
  "most_actives",
  "day_gainers",
  "day_losers",
];

const SCREENER_COUNT = 50;
const MIN_PRICE = 1;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function quotesFromValidationError(error: unknown): ScreenerQuote[] | null {
  if (
    !error ||
    typeof error !== "object" ||
    !("result" in error) ||
    !error.result ||
    typeof error.result !== "object"
  ) {
    return null;
  }

  const quotes = (error.result as { quotes?: unknown }).quotes;
  return Array.isArray(quotes) ? (quotes as ScreenerQuote[]) : null;
}

async function fetchScreen(source: ScreenerSource): Promise<ScreenerQuote[]> {
  try {
    const result = (await yahooFinance.screener(
      {
        scrIds: source,
        count: SCREENER_COUNT,
      },
      undefined,
      { validateResult: false },
    )) as { quotes?: ScreenerQuote[] };
    return (result.quotes ?? []) as ScreenerQuote[];
  } catch (error) {
    const recovered = quotesFromValidationError(error);
    if (recovered) {
      console.warn(
        `Screener "${source}" failed validation but returned ${recovered.length} quotes; using them anyway.`,
      );
      return recovered;
    }
    console.error(`Screener "${source}" failed:`, error);
    return [];
  }
}

/**
 * Builds a universe of candidates from several predefined screens and ranks
 * them by *relative* volume (today's volume vs. 3-month average) so that
 * genuine volume spikes surface ahead of perennially heavy names.
 */
export async function fetchVolumeUniverse(): Promise<VolumeCandidate[]> {
  const cacheKey = "scanner:universe";
  const cached = getCached<VolumeCandidate[]>(cacheKey);
  if (cached) return cached;

  const screens = await Promise.all(SOURCES.map((source) => fetchScreen(source)));

  const bySymbol = new Map<string, VolumeCandidate>();

  screens.forEach((quotes, index) => {
    const source = SOURCES[index]!;
    for (const quote of quotes) {
      const symbol = quote.symbol?.toUpperCase();
      if (!symbol) continue;
      if (quote.quoteType && quote.quoteType !== "EQUITY") continue;

      const price = num(quote.regularMarketPrice);
      if (price !== null && price < MIN_PRICE) continue;

      const volume = num(quote.regularMarketVolume);
      const averageVolume =
        num(quote.averageDailyVolume3Month) ??
        num(quote.averageDailyVolume10Day);

      const existing = bySymbol.get(symbol);
      if (existing) {
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
        continue;
      }

      bySymbol.set(symbol, {
        symbol,
        companyName: quote.shortName ?? quote.longName ?? null,
        price,
        changePercent: num(quote.regularMarketChangePercent),
        volume,
        averageVolume,
        relativeVolume: computeRelativeVolume(volume, averageVolume),
        marketCap: num(quote.marketCap),
        sources: [source],
      });
    }
  });

  const universe = [...bySymbol.values()].sort(
    (a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0),
  );

  setCached(cacheKey, universe, ANALYSIS_CACHE_TTL_MS);
  return universe;
}
