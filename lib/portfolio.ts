import type {
  AggregatedBubble,
  HoldingWithQuote,
  PortfolioSummary,
  QuotesMap,
} from "@/lib/types";
import type { Holding } from "@/lib/generated/prisma/client";

export function computeHoldingMetrics(
  holding: Holding,
  quotes: QuotesMap,
  totalPortfolioValue: number | null,
): HoldingWithQuote {
  const quote = quotes[holding.symbol.toUpperCase()];
  const livePrice = quote?.price ?? null;
  const costBasis = holding.shares * holding.purchasePrice;
  const currentValue = livePrice !== null ? holding.shares * livePrice : null;
  const gainLossPct =
    livePrice !== null
      ? ((livePrice - holding.purchasePrice) / holding.purchasePrice) * 100
      : null;
  const gainLossAbs = currentValue !== null ? currentValue - costBasis : null;
  const portfolioWeight =
    currentValue !== null && totalPortfolioValue && totalPortfolioValue > 0
      ? (currentValue / totalPortfolioValue) * 100
      : null;

  return {
    ...holding,
    livePrice,
    companyName: quote?.companyName ?? null,
    currentValue,
    costBasis,
    gainLossPct,
    gainLossAbs,
    portfolioWeight,
    isPositive: gainLossPct !== null ? gainLossPct >= 0 : null,
  };
}

export function computeTotalPortfolioValue(
  holdings: Holding[],
  quotes: QuotesMap,
): number {
  return holdings.reduce((total, holding) => {
    const quote = quotes[holding.symbol.toUpperCase()];
    if (!quote) return total;
    return total + holding.shares * quote.price;
  }, 0);
}

export function enrichHoldings(
  holdings: Holding[],
  quotes: QuotesMap,
): HoldingWithQuote[] {
  const totalValue = computeTotalPortfolioValue(holdings, quotes);
  const totalForWeight = totalValue > 0 ? totalValue : null;

  return holdings.map((holding) =>
    computeHoldingMetrics(holding, quotes, totalForWeight),
  );
}

export function aggregateBySymbol(
  holdings: HoldingWithQuote[],
): AggregatedBubble[] {
  const grouped = new Map<string, AggregatedBubble>();

  for (const holding of holdings) {
    const symbol = holding.symbol.toUpperCase();
    const existing = grouped.get(symbol);

    if (!existing) {
      grouped.set(symbol, {
        symbol,
        companyName: holding.companyName,
        shares: holding.shares,
        avgPurchasePrice: holding.purchasePrice,
        livePrice: holding.livePrice,
        currentValue: holding.currentValue,
        costBasis: holding.costBasis,
        gainLossPct: holding.gainLossPct,
        gainLossAbs: holding.gainLossAbs,
        portfolioWeight: holding.portfolioWeight,
        isPositive: holding.isPositive,
      });
      continue;
    }

    const totalShares = existing.shares + holding.shares;
    const totalCostBasis = existing.costBasis + holding.costBasis;
    const avgPurchasePrice = totalCostBasis / totalShares;
    const currentValue =
      existing.currentValue !== null && holding.currentValue !== null
        ? existing.currentValue + holding.currentValue
        : existing.currentValue ?? holding.currentValue;

    const livePrice = holding.livePrice ?? existing.livePrice;
    const gainLossPct =
      livePrice !== null
        ? ((livePrice - avgPurchasePrice) / avgPurchasePrice) * 100
        : null;
    const gainLossAbs =
      currentValue !== null ? currentValue - totalCostBasis : null;

    grouped.set(symbol, {
      symbol,
      companyName: holding.companyName ?? existing.companyName,
      shares: totalShares,
      avgPurchasePrice,
      livePrice,
      currentValue,
      costBasis: totalCostBasis,
      gainLossPct,
      gainLossAbs,
      portfolioWeight: null,
      isPositive: gainLossPct !== null ? gainLossPct >= 0 : null,
    });
  }

  const bubbles = Array.from(grouped.values());
  const totalValue = bubbles.reduce(
    (sum, b) => sum + (b.currentValue ?? 0),
    0,
  );

  if (totalValue > 0) {
    for (const bubble of bubbles) {
      bubble.portfolioWeight =
        bubble.currentValue !== null
          ? (bubble.currentValue / totalValue) * 100
          : null;
    }
  }

  return bubbles;
}

export function computePortfolioSummary(
  holdings: HoldingWithQuote[],
): PortfolioSummary {
  const totalValue = holdings.reduce(
    (sum, h) => sum + (h.currentValue ?? 0),
    0,
  );
  const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);
  const totalGainLossAbs = totalValue - totalCostBasis;
  const totalGainLossPct =
    totalCostBasis > 0 ? (totalGainLossAbs / totalCostBasis) * 100 : 0;

  return {
    totalValue,
    totalCostBasis,
    totalGainLossAbs,
    totalGainLossPct,
  };
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
