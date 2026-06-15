import type { Holding } from "@/lib/generated/prisma/client";

export type Quote = {
  price: number;
  currency: string;
  fetchedAt: string;
  companyName?: string | null;
  changePercent?: number | null;
  previousClose?: number | null;
  marketState?: string | null;
  source?: "yahoo" | "finnhub";
};

export type QuotesMap = Record<string, Quote>;

export type HoldingWithQuote = Holding & {
  livePrice: number | null;
  companyName: string | null;
  currentValue: number | null;
  costBasis: number;
  gainLossPct: number | null;
  gainLossAbs: number | null;
  portfolioWeight: number | null;
  isPositive: boolean | null;
};

export type AggregatedBubble = {
  symbol: string;
  companyName: string | null;
  shares: number;
  avgPurchasePrice: number;
  livePrice: number | null;
  currentValue: number | null;
  costBasis: number;
  gainLossPct: number | null;
  gainLossAbs: number | null;
  portfolioWeight: number | null;
  isPositive: boolean | null;
};

export type PortfolioSummary = {
  totalValue: number;
  totalCostBasis: number;
  totalGainLossAbs: number;
  totalGainLossPct: number;
};
