import type {
  IndicatorSnapshot,
  MarketRegime,
  TimingPillar,
  WatchlistTimingEntry,
  WatchlistTimingReport,
  WatchlistTimingVerdict,
} from "@/lib/types";

export const WATCHLIST_TIMING_DISCLAIMER =
  "Watchlist timing is inferred from public daily OHLCV data (money flow, 150-day trend, pullback character). It is not institutional order flow and is not a buy or sell recommendation.";

const RISING_SMA150_SLOPE_PCT = 0.3;
const FALLING_SMA150_SLOPE_PCT = -0.3;

function normalizeQuoteSymbol(
  quoteSymbol: string | null | undefined,
): string | null {
  const normalized = quoteSymbol?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function mergeQuoteSymbols(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  return normalizeQuoteSymbol(primary) ?? normalizeQuoteSymbol(fallback);
}

function resolveQuoteSymbolForFetch(
  quoteSymbol: string | null,
  symbol: string,
): string {
  return normalizeQuoteSymbol(quoteSymbol) ?? symbol.trim().toUpperCase();
}

function scoreFlow(indicators: IndicatorSnapshot): TimingPillar {
  const { volumeSignal, cmf20, buyVolumePct20 } = indicators;

  if (volumeSignal === "buying") {
    const detail =
      cmf20 !== null && buyVolumePct20 !== null
        ? `CMF ${cmf20.toFixed(2)}, ${buyVolumePct20.toFixed(0)}% buy-side volume`
        : "Money flow metrics lean accumulation";
    return {
      id: "flow",
      label: "Money flow",
      verdict: "bullish",
      summary: detail,
    };
  }

  if (volumeSignal === "selling") {
    const detail =
      cmf20 !== null && buyVolumePct20 !== null
        ? `CMF ${cmf20.toFixed(2)}, ${buyVolumePct20.toFixed(0)}% buy-side volume`
        : "Money flow metrics lean distribution";
    return {
      id: "flow",
      label: "Money flow",
      verdict: "bearish",
      summary: detail,
    };
  }

  if (cmf20 === null && buyVolumePct20 === null) {
    return {
      id: "flow",
      label: "Money flow",
      verdict: "insufficient",
      summary: "Not enough volume history",
    };
  }

  return {
    id: "flow",
    label: "Money flow",
    verdict: "neutral",
    summary: "Flow is mixed or inconclusive",
  };
}

function scoreTrend(indicators: IndicatorSnapshot): TimingPillar {
  const { currentPrice, sma150, sma150SlopePct } = indicators;

  if (currentPrice === null || sma150 === null || sma150SlopePct === null) {
    return {
      id: "trend",
      label: "150d trend",
      verdict: "insufficient",
      summary: "Need ~170 sessions of price history",
    };
  }

  const above = currentPrice > sma150;
  const rising = sma150SlopePct >= RISING_SMA150_SLOPE_PCT;
  const falling = sma150SlopePct <= FALLING_SMA150_SLOPE_PCT;

  if (above && rising) {
    return {
      id: "trend",
      label: "150d trend",
      verdict: "bullish",
      summary: `Price above rising 150d average (+${sma150SlopePct.toFixed(1)}% slope)`,
    };
  }

  if (!above && falling) {
    return {
      id: "trend",
      label: "150d trend",
      verdict: "bearish",
      summary: `Price below falling 150d average (${sma150SlopePct.toFixed(1)}% slope)`,
    };
  }

  const position = above ? "above" : "below";
  const slope = rising ? "rising" : falling ? "falling" : "flat";
  return {
    id: "trend",
    label: "150d trend",
    verdict: "neutral",
    summary: `Price ${position} 150d line, line ${slope}`,
  };
}

function scorePullback(indicators: IndicatorSnapshot): TimingPillar {
  const {
    drawdownFromHigh20Pct,
    rsi14,
    recentPanicSell,
    currentPrice,
    high20d,
  } = indicators;

  if (
    currentPrice === null ||
    drawdownFromHigh20Pct === null ||
    rsi14 === null
  ) {
    return {
      id: "pullback",
      label: "Pullback",
      verdict: "insufficient",
      summary: "Not enough data to classify the recent move",
    };
  }

  const dd = drawdownFromHigh20Pct;

  if (recentPanicSell || (dd <= -12 && rsi14 < 40)) {
    return {
      id: "pullback",
      label: "Pullback",
      verdict: "bearish",
      summary: recentPanicSell
        ? "High-volume selloff in the last week — panic character"
        : `${dd.toFixed(1)}% off 20d high, RSI ${rsi14.toFixed(0)} — breakdown risk`,
    };
  }

  if (dd > -3 && rsi14 < 72) {
    return {
      id: "pullback",
      label: "Pullback",
      verdict: "bullish",
      summary: "Near recent highs — no meaningful pullback needed",
    };
  }

  if (dd <= -3 && dd >= -15 && rsi14 >= 35 && rsi14 <= 58) {
    return {
      id: "pullback",
      label: "Pullback",
      verdict: "bullish",
      summary: `${dd.toFixed(1)}% off 20d high — shallow rest, RSI ${rsi14.toFixed(0)}`,
    };
  }

  if (dd < -15) {
    return {
      id: "pullback",
      label: "Pullback",
      verdict: "neutral",
      summary: `${dd.toFixed(1)}% off 20d high — deep but not clearly capitulatory`,
    };
  }

  return {
    id: "pullback",
    label: "Pullback",
    verdict: "neutral",
    summary:
      high20d !== null
        ? `${dd.toFixed(1)}% off 20d high, RSI ${rsi14.toFixed(0)} — mixed`
        : "Pullback character is unclear",
  };
}

function aggregateVerdict(pillars: TimingPillar[]): WatchlistTimingVerdict {
  const scorable = pillars.filter((p) => p.verdict !== "insufficient");
  if (scorable.length === 0) return "watch";

  const bullish = scorable.filter((p) => p.verdict === "bullish").length;
  const bearish = scorable.filter((p) => p.verdict === "bearish").length;

  if (bearish >= 2) return "avoid";
  if (bullish === 3) return "opportunity";
  if (bullish >= 2 && bearish === 0) return "opportunity";
  return "watch";
}

function applyModifiers(
  verdict: WatchlistTimingVerdict,
  pillars: TimingPillar[],
  options: {
    targetPrice: number | null;
    livePrice: number | null;
    regime: MarketRegime;
  },
): { verdict: WatchlistTimingVerdict; notes: string[] } {
  const notes: string[] = [];
  let adjusted = verdict;

  if (
    options.targetPrice !== null &&
    options.livePrice !== null &&
    options.livePrice > options.targetPrice * 1.02
  ) {
    if (adjusted === "opportunity") adjusted = "watch";
    notes.push("Above your target entry zone");
  }

  if (options.regime === "risk_off" && adjusted === "opportunity") {
    const trend = pillars.find((p) => p.id === "trend");
    if (trend?.verdict !== "bullish") {
      adjusted = "watch";
      notes.push("Market regime is risk-off — timing capped to watch");
    }
  }

  if (pillars.some((p) => p.verdict === "insufficient")) {
    if (adjusted === "opportunity") adjusted = "watch";
    notes.push("Some signals lack sufficient history");
  }

  return { verdict: adjusted, notes };
}

export type TimingCandidate = {
  symbol: string;
  quoteSymbol: string | null;
  companyName: string | null;
  targetPrice: number | null;
  sources: Array<"watchlist" | "holding">;
};

export function mergeTimingUniverse(
  watchlistItems: {
    symbol: string;
    quoteSymbol: string | null;
    companyName: string | null;
    targetPrice: number | null;
  }[],
  holdings: {
    symbol: string;
    quoteSymbol: string | null;
  }[],
): TimingCandidate[] {
  const bySymbol = new Map<string, TimingCandidate>();

  for (const holding of holdings) {
    const symbol = holding.symbol.trim().toUpperCase();
    if (!symbol || bySymbol.has(symbol)) continue;

    bySymbol.set(symbol, {
      symbol,
      quoteSymbol: normalizeQuoteSymbol(holding.quoteSymbol),
      companyName: null,
      targetPrice: null,
      sources: ["holding"],
    });
  }

  for (const item of watchlistItems) {
    const symbol = item.symbol.trim().toUpperCase();
    if (!symbol) continue;

    const existing = bySymbol.get(symbol);
    if (existing) {
      bySymbol.set(symbol, {
        symbol,
        quoteSymbol: mergeQuoteSymbols(item.quoteSymbol, existing.quoteSymbol),
        companyName: item.companyName ?? existing.companyName,
        targetPrice: item.targetPrice ?? existing.targetPrice,
        sources: existing.sources.includes("watchlist")
          ? existing.sources
          : [...existing.sources, "watchlist"],
      });
      continue;
    }

    bySymbol.set(symbol, {
      symbol,
      quoteSymbol: normalizeQuoteSymbol(item.quoteSymbol),
      companyName: item.companyName,
      targetPrice: item.targetPrice,
      sources: ["watchlist"],
    });
  }

  return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export type WatchlistTimingInput = {
  symbol: string;
  quoteSymbol: string;
  companyName: string | null;
  targetPrice: number | null;
  indicators: IndicatorSnapshot;
  regime: MarketRegime;
  sources: Array<"watchlist" | "holding">;
};

export function scoreStockTiming(input: {
  symbol: string;
  quoteSymbol: string;
  companyName: string | null;
  indicators: IndicatorSnapshot;
  regime: MarketRegime;
  targetPrice?: number | null;
}): WatchlistTimingEntry {
  return scoreWatchlistEntry({
    ...input,
    targetPrice: input.targetPrice ?? null,
    sources: [],
  });
}

export function scoreWatchlistEntry(
  input: WatchlistTimingInput,
): WatchlistTimingEntry {
  const pillars = [
    scoreFlow(input.indicators),
    scoreTrend(input.indicators),
    scorePullback(input.indicators),
  ];

  const baseVerdict = aggregateVerdict(pillars);
  const { verdict, notes } = applyModifiers(baseVerdict, pillars, {
    targetPrice: input.targetPrice,
    livePrice: input.indicators.currentPrice,
    regime: input.regime,
  });

  return {
    symbol: input.symbol,
    quoteSymbol: input.quoteSymbol,
    companyName: input.companyName,
    targetPrice: input.targetPrice,
    livePrice: input.indicators.currentPrice,
    verdict,
    pillars,
    notes,
    sources: input.sources,
  };
}

export async function buildWatchlistTimingReport(
  items: TimingCandidate[],
  regime: MarketRegime,
  fetchIndicatorsFn: (symbol: string) => Promise<IndicatorSnapshot>,
): Promise<WatchlistTimingReport> {
  if (items.length === 0) {
    return { entries: [], disclaimer: WATCHLIST_TIMING_DISCLAIMER };
  }

  const results = await Promise.allSettled(
    items.map(async (item) => {
      const quoteSymbol = resolveQuoteSymbolForFetch(item.quoteSymbol, item.symbol);
      const indicators = await fetchIndicatorsFn(quoteSymbol);
      return scoreWatchlistEntry({
        symbol: item.symbol,
        quoteSymbol,
        companyName: item.companyName,
        targetPrice: item.targetPrice,
        indicators,
        regime,
        sources: item.sources,
      });
    }),
  );

  const entries = results
    .filter((r): r is PromiseFulfilledResult<WatchlistTimingEntry> =>
      r.status === "fulfilled",
    )
    .map((r) => r.value)
    .sort((a, b) => {
      const order: Record<WatchlistTimingVerdict, number> = {
        opportunity: 0,
        watch: 1,
        avoid: 2,
      };
      if (order[a.verdict] !== order[b.verdict]) {
        return order[a.verdict] - order[b.verdict];
      }
      return a.symbol.localeCompare(b.symbol);
    });

  return { entries, disclaimer: WATCHLIST_TIMING_DISCLAIMER };
}
