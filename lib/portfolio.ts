import { INITIAL_CAPITAL_EUR, convertAmount, PORTFOLIO_BASE_CURRENCY } from "@/lib/currency-utils";
import { getQuoteSymbol } from "@/lib/holding-utils";
import {
  computeRelativeVolume,
  isUnusualVolume,
} from "@/lib/volume-utils";
import type {
  AggregatedBubble,
  HoldingWithQuote,
  PortfolioCurrency,
  PortfolioSummary,
  PositionContext,
  QuotesMap,
} from "@/lib/types";
import type { Holding } from "@/lib/generated/prisma/client";

function normalizeCurrency(value: string | null | undefined): PortfolioCurrency {
  return value === "EUR" ? "EUR" : "USD";
}

function purchaseInQuoteCurrency(
  purchasePrice: number,
  purchaseCurrency: PortfolioCurrency,
  quoteCurrency: PortfolioCurrency,
  eurUsdRate: number | null,
): number {
  return convertAmount(
    purchasePrice,
    purchaseCurrency,
    quoteCurrency,
    eurUsdRate,
  );
}

function dayChangeFromQuote(
  quote: QuotesMap[string] | undefined,
  livePrice: number | null,
): number | null {
  if (quote?.changePercent != null && Number.isFinite(quote.changePercent)) {
    return quote.changePercent;
  }

  if (
    livePrice !== null &&
    quote?.previousClose != null &&
    quote.previousClose > 0
  ) {
    return ((livePrice - quote.previousClose) / quote.previousClose) * 100;
  }

  return null;
}

export function computeHoldingMetrics(
  holding: Holding,
  quotes: QuotesMap,
  totalPortfolioValue: number | null,
  eurUsdRate: number | null,
): HoldingWithQuote {
  const quote = quotes[getQuoteSymbol(holding)];
  const livePrice = quote?.price ?? null;
  const purchaseCurrency = normalizeCurrency(holding.purchaseCurrency);
  const quoteCurrency = normalizeCurrency(quote?.currency);
  const costBasis = holding.shares * holding.purchasePrice;
  const currentValue = livePrice !== null ? holding.shares * livePrice : null;

  const comparablePurchasePrice =
    livePrice !== null
      ? purchaseInQuoteCurrency(
          holding.purchasePrice,
          purchaseCurrency,
          quoteCurrency,
          eurUsdRate,
        )
      : null;

  const gainLossPct =
    livePrice !== null && comparablePurchasePrice !== null
      ? ((livePrice - comparablePurchasePrice) / comparablePurchasePrice) * 100
      : null;
  const gainLossAbs =
    livePrice !== null && comparablePurchasePrice !== null
      ? holding.shares * (livePrice - comparablePurchasePrice)
      : null;

  const valueForWeight =
    currentValue !== null
      ? convertAmount(
          currentValue,
          quoteCurrency,
          PORTFOLIO_BASE_CURRENCY,
          eurUsdRate,
        )
      : null;

  const portfolioWeight =
    valueForWeight !== null && totalPortfolioValue && totalPortfolioValue > 0
      ? (valueForWeight / totalPortfolioValue) * 100
      : null;

  const relativeVolume = computeRelativeVolume(
    quote?.volume,
    quote?.averageVolume,
  );

  return {
    ...holding,
    purchaseCurrency,
    quoteCurrency,
    livePrice,
    companyName: quote?.companyName ?? null,
    currentValue,
    costBasis,
    gainLossPct,
    gainLossAbs,
    dayChangePct: dayChangeFromQuote(quote, livePrice),
    relativeVolume,
    unusualVolume: isUnusualVolume(relativeVolume),
    portfolioWeight,
    isPositive: gainLossPct !== null ? gainLossPct >= 0 : null,
  };
}

export function computeTotalPortfolioValue(
  holdings: Holding[],
  quotes: QuotesMap,
  eurUsdRate: number | null,
): number {
  return holdings.reduce((total, holding) => {
    const quote = quotes[getQuoteSymbol(holding)];
    if (!quote) return total;
    const quoteCurrency = normalizeCurrency(quote.currency);
    const value = holding.shares * quote.price;
    return (
      total +
      convertAmount(value, quoteCurrency, PORTFOLIO_BASE_CURRENCY, eurUsdRate)
    );
  }, 0);
}

export function enrichHoldings(
  holdings: Holding[],
  quotes: QuotesMap,
  eurUsdRate: number | null,
): HoldingWithQuote[] {
  const totalValue = computeTotalPortfolioValue(holdings, quotes, eurUsdRate);
  const totalForWeight = totalValue > 0 ? totalValue : null;

  return holdings.map((holding) =>
    computeHoldingMetrics(holding, quotes, totalForWeight, eurUsdRate),
  );
}

function sumCostBasisInCurrency(
  holdings: HoldingWithQuote[],
  targetCurrency: PortfolioCurrency,
  eurUsdRate: number | null,
): number {
  return holdings.reduce(
    (sum, holding) =>
      sum +
      convertAmount(
        holding.costBasis,
        holding.purchaseCurrency,
        targetCurrency,
        eurUsdRate,
      ),
    0,
  );
}

function sumCurrentValueInCurrency(
  holdings: HoldingWithQuote[],
  targetCurrency: PortfolioCurrency,
  eurUsdRate: number | null,
): number {
  return holdings.reduce((sum, holding) => {
    if (holding.currentValue === null) return sum;
    return (
      sum +
      convertAmount(
        holding.currentValue,
        holding.quoteCurrency,
        targetCurrency,
        eurUsdRate,
      )
    );
  }, 0);
}

export function aggregatePositionFromHoldings(
  holdings: HoldingWithQuote[],
  portfolioSummaryTotalValue: number,
  eurUsdRate: number | null,
): PositionContext | null {
  if (holdings.length === 0) return null;

  const quoteCurrency = holdings[0]!.quoteCurrency;
  const totalShares = holdings.reduce((sum, holding) => sum + holding.shares, 0);
  const totalCostInQuote = sumCostBasisInCurrency(
    holdings,
    quoteCurrency,
    eurUsdRate,
  );
  const avgPurchasePrice = totalCostInQuote / totalShares;
  const livePrice = holdings[0]?.livePrice ?? null;
  const currentValueInBase = sumCurrentValueInCurrency(
    holdings,
    PORTFOLIO_BASE_CURRENCY,
    eurUsdRate,
  );

  return {
    shares: totalShares,
    purchasePrice: avgPurchasePrice,
    purchaseCurrency: quoteCurrency,
    quoteCurrency,
    livePrice,
    gainLossPct:
      livePrice !== null
        ? ((livePrice - avgPurchasePrice) / avgPurchasePrice) * 100
        : null,
    portfolioWeight:
      portfolioSummaryTotalValue > 0
        ? (currentValueInBase / portfolioSummaryTotalValue) * 100
        : null,
  };
}

export function aggregateBySymbol(
  holdings: HoldingWithQuote[],
  eurUsdRate: number | null,
): AggregatedBubble[] {
  const grouped = new Map<string, AggregatedBubble>();

  for (const holding of holdings) {
    const symbol = holding.symbol.toUpperCase();
    const existing = grouped.get(symbol);

    if (!existing) {
      const quoteCurrency = holding.quoteCurrency;
      const costInQuote = convertAmount(
        holding.costBasis,
        holding.purchaseCurrency,
        quoteCurrency,
        eurUsdRate,
      );

      grouped.set(symbol, {
        symbol,
        companyName: holding.companyName,
        purchaseCurrency: holding.purchaseCurrency,
        quoteCurrency,
        shares: holding.shares,
        avgPurchasePrice: costInQuote / holding.shares,
        livePrice: holding.livePrice,
        currentValue: holding.currentValue,
        costBasis: costInQuote,
        gainLossPct: holding.gainLossPct,
        gainLossAbs: holding.gainLossAbs,
        portfolioWeight: holding.portfolioWeight,
        isPositive: holding.isPositive,
      });
      continue;
    }

    const quoteCurrency = existing.quoteCurrency;
    const totalShares = existing.shares + holding.shares;
    const holdingCostInQuote = convertAmount(
      holding.costBasis,
      holding.purchaseCurrency,
      quoteCurrency,
      eurUsdRate,
    );
    const totalCostInQuote = existing.costBasis + holdingCostInQuote;
    const avgPurchasePrice = totalCostInQuote / totalShares;
    const currentValue =
      existing.currentValue !== null || holding.currentValue !== null
        ? (existing.currentValue !== null
            ? convertAmount(
                existing.currentValue,
                existing.quoteCurrency,
                quoteCurrency,
                eurUsdRate,
              )
            : 0) +
          (holding.currentValue !== null
            ? convertAmount(
                holding.currentValue,
                holding.quoteCurrency,
                quoteCurrency,
                eurUsdRate,
              )
            : 0)
        : null;

    const livePrice = holding.livePrice ?? existing.livePrice;
    const gainLossPct =
      livePrice !== null
        ? ((livePrice - avgPurchasePrice) / avgPurchasePrice) * 100
        : null;
    const gainLossAbs =
      currentValue !== null ? currentValue - totalCostInQuote : null;

    grouped.set(symbol, {
      symbol,
      companyName: existing.companyName ?? holding.companyName,
      purchaseCurrency: existing.purchaseCurrency,
      quoteCurrency: existing.quoteCurrency,
      shares: totalShares,
      avgPurchasePrice,
      livePrice,
      currentValue,
      costBasis: totalCostInQuote,
      gainLossPct,
      gainLossAbs,
      portfolioWeight: null,
      isPositive: gainLossPct !== null ? gainLossPct >= 0 : null,
    });
  }

  const bubbles = Array.from(grouped.values());
  const totalValueInBase = bubbles.reduce(
    (sum, bubble) =>
      sum +
      (bubble.currentValue !== null
        ? convertAmount(
            bubble.currentValue,
            bubble.quoteCurrency,
            PORTFOLIO_BASE_CURRENCY,
            eurUsdRate,
          )
        : 0),
    0,
  );

  if (totalValueInBase > 0) {
    for (const bubble of bubbles) {
      bubble.portfolioWeight =
        bubble.currentValue !== null
          ? (convertAmount(
              bubble.currentValue,
              bubble.quoteCurrency,
              PORTFOLIO_BASE_CURRENCY,
              eurUsdRate,
            ) /
              totalValueInBase) *
            100
          : null;
    }
  }

  return bubbles;
}

function resolveSummaryCurrency(): PortfolioCurrency {
  return PORTFOLIO_BASE_CURRENCY;
}

export function computePortfolioSummary(
  holdings: HoldingWithQuote[],
  eurUsdRate: number | null,
  cash: { cashUsd: number; cashEur: number } = { cashUsd: 0, cashEur: 0 },
): PortfolioSummary {
  const currency = resolveSummaryCurrency();
  const hasUsdHoldings = holdings.some(
    (holding) =>
      holding.purchaseCurrency === "USD" || holding.quoteCurrency === "USD",
  );
  const hasMixedCurrencies = hasUsdHoldings;

  const totalValue = holdings.reduce((sum, holding) => {
    if (holding.currentValue === null) return sum;
    return (
      sum +
      convertAmount(
        holding.currentValue,
        holding.quoteCurrency,
        currency,
        eurUsdRate,
      )
    );
  }, 0);

  const cashUsdInSummary = convertAmount(
    cash.cashUsd,
    "USD",
    currency,
    eurUsdRate,
  );
  const cashEurInSummary = convertAmount(
    cash.cashEur,
    "EUR",
    currency,
    eurUsdRate,
  );
  const availableCash = cashUsdInSummary + cashEurInSummary;
  const totalNetWorth = totalValue + availableCash;
  const gainLossAbs = totalNetWorth - INITIAL_CAPITAL_EUR;
  const gainLossPct =
    INITIAL_CAPITAL_EUR > 0
      ? (gainLossAbs / INITIAL_CAPITAL_EUR) * 100
      : 0;

  return {
    totalValue,
    availableCash,
    totalNetWorth,
    initialCapital: INITIAL_CAPITAL_EUR,
    gainLossAbs,
    gainLossPct,
    cashUsd: cash.cashUsd,
    cashEur: cash.cashEur,
    currency,
    hasMixedCurrencies,
    eurUsdRate,
  };
}

export function formatCurrency(
  value: number,
  currency: PortfolioCurrency = "USD",
): string {
  const locale = currency === "EUR" ? "de-DE" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
