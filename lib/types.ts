import type { Holding } from "@/lib/generated/prisma/client";

export type AssetType = "stock" | "commodity" | "etc" | "etf";

export type PortfolioCurrency = "USD" | "EUR";

export type Quote = {
  price: number;
  currency: string;
  fetchedAt: string;
  companyName?: string | null;
  changePercent?: number | null;
  previousClose?: number | null;
  volume?: number | null;
  averageVolume?: number | null;
  marketState?: string | null;
  source?: "yahoo" | "finnhub";
};

export type QuotesMap = Record<string, Quote>;

export type HoldingWithQuote = Holding & {
  livePrice: number | null;
  companyName: string | null;
  purchaseCurrency: PortfolioCurrency;
  quoteCurrency: PortfolioCurrency;
  currentValue: number | null;
  costBasis: number;
  gainLossPct: number | null;
  gainLossAbs: number | null;
  dayChangePct: number | null;
  relativeVolume: number | null;
  unusualVolume: boolean;
  portfolioWeight: number | null;
  isPositive: boolean | null;
};

export type AggregatedBubble = {
  symbol: string;
  companyName: string | null;
  purchaseCurrency: PortfolioCurrency;
  quoteCurrency: PortfolioCurrency;
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
  currency: PortfolioCurrency;
  hasMixedCurrencies: boolean;
  eurUsdRate: number | null;
};

export type FinancialsSnapshot = {
  symbol: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  eps: number | null;
  revenueGrowth: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  beta: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  targetMeanPrice: number | null;
  recommendationMean: number | null;
  analystStrongBuy: number | null;
  analystBuy: number | null;
  analystHold: number | null;
  analystSell: number | null;
  analystStrongSell: number | null;
  fetchedAt: string;
};

export type IndicatorSnapshot = {
  symbol: string;
  currentPrice: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  change30d: number | null;
  buyVolumePct20: number | null;
  cmf20: number | null;
  relativeVolume: number | null;
  unusualVolume: boolean;
  volumeSignal: "buying" | "selling" | "neutral";
  trend: "bullish" | "bearish" | "neutral";
  fetchedAt: string;
};

export type NewsItem = {
  title: string;
  summary: string | null;
  url: string | null;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "negative" | "neutral";
};

export type NewsSnapshot = {
  symbol: string;
  items: NewsItem[];
  overallSentiment: "positive" | "negative" | "neutral";
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  fetchedAt: string;
};

export type StockDataBundle = {
  symbol: string;
  financials: FinancialsSnapshot;
  indicators: IndicatorSnapshot;
  news: NewsSnapshot;
};

export type AgentRole =
  | "research"
  | "technical"
  | "news"
  | "risk"
  | "portfolio_manager"
  | "compliance";

export type AgentSignal = "bullish" | "bearish" | "neutral";

export type Recommendation = "buy" | "hold" | "sell" | "watch";

export type AgentOutput = {
  role: AgentRole;
  displayName: string;
  signal: AgentSignal;
  confidence: number;
  keyPoints: string[];
  concerns: string[];
};

export type PositionContext = {
  shares: number;
  purchasePrice: number;
  purchaseCurrency: PortfolioCurrency;
  quoteCurrency: PortfolioCurrency;
  livePrice: number | null;
  gainLossPct: number | null;
  portfolioWeight: number | null;
};

export type AnalysisContext = {
  symbol: string;
  companyName: string;
  data: StockDataBundle;
  position?: PositionContext;
  portfolioSummary?: PortfolioSummary;
};

export type AnalysisReport = {
  id?: string;
  symbol: string;
  recommendation: Recommendation;
  confidence: number;
  executiveSummary: string;
  agentOutputs: AgentOutput[];
  generatedAt: string;
  position?: PositionContext;
  disclaimer: string;
};
