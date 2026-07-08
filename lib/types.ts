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
  availableCash: number;
  totalNetWorth: number;
  realizedGainLoss: number;
  cashUsd: number;
  cashEur: number;
  currency: PortfolioCurrency;
  hasMixedCurrencies: boolean;
  eurUsdRate: number | null;
};

export type TransactionType = "buy" | "sell";

export type TransactionRecord = {
  id: string;
  type: TransactionType;
  symbol: string;
  quoteSymbol: string | null;
  assetType: string;
  companyName: string | null;
  shares: number;
  price: number;
  currency: PortfolioCurrency;
  amount: number;
  costBasis: number | null;
  gainLossAbs: number | null;
  gainLossPct: number | null;
  createdAt: string;
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
  longBusinessSummary: string | null;
  fetchedAt: string;
};

export type IndicatorSnapshot = {
  symbol: string;
  currentPrice: number | null;
  sma20: number | null;
  sma50: number | null;
  sma150: number | null;
  sma200: number | null;
  sma150SlopePct: number | null;
  high20d: number | null;
  drawdownFromHigh20Pct: number | null;
  rsi14: number | null;
  change30d: number | null;
  buyVolumePct20: number | null;
  cmf20: number | null;
  relativeVolume: number | null;
  unusualVolume: boolean;
  recentPanicSell: boolean;
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

export type AnalysisMode = "rules" | "gemini";

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
  analysisMode?: AnalysisMode;
  llmModel?: string;
  llmFallbackReason?: string;
  companyIntro?: string;
  timing?: WatchlistTimingEntry;
  timingDisclaimer?: string;
};

// --- Market Board of Advisers (market-wide analysis) ---

export type MarketSignal = "risk_on" | "risk_off" | "neutral";

export type MarketRegime = "risk_on" | "risk_off" | "mixed";

export type MarketInstrument = {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
};

export type SectorPerformance = {
  symbol: string;
  sector: string;
  changePercent: number | null;
  relativeVolume: number | null;
  flowSignal: "accumulation" | "distribution" | "neutral";
};

export type MarketBreadth = {
  advancers: number;
  decliners: number;
  unchanged: number;
  advanceDeclineRatio: number | null;
};

export type MarketSnapshot = {
  indices: MarketInstrument[];
  volatility: MarketInstrument | null;
  macro: MarketInstrument[];
  sectors: SectorPerformance[];
  breadth: MarketBreadth;
  news: NewsSnapshot;
  fetchedAt: string;
};

export type BoardRole =
  | "macro"
  | "sector_rotation"
  | "institutional_flow"
  | "geopolitical"
  | "chief_strategist";

export type BoardMemberOutput = {
  role: BoardRole;
  displayName: string;
  signal: MarketSignal;
  confidence: number;
  keyPoints: string[];
  watchItems: string[];
};

export type MarketBoardReport = {
  id?: string;
  regime: MarketRegime;
  confidence: number;
  executiveSummary: string;
  members: BoardMemberOutput[];
  watchlistTiming: WatchlistTimingReport;
  snapshot: MarketSnapshot;
  generatedAt: string;
  analysisMode?: AnalysisMode;
  llmModel?: string;
  llmFallbackReason?: string;
  disclaimer: string;
};

export type BoardChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type BoardChatResponse = {
  reply: string;
  researchSymbols?: string[];
  analysisMode: AnalysisMode;
  llmModel?: string;
  refreshedMarket?: boolean;
};

// --- Opportunity Scanner (volume-driven stock discovery) ---

export type ScreenerSource = "most_actives" | "day_gainers" | "day_losers";

export type VolumeCandidate = {
  symbol: string;
  companyName: string | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  averageVolume: number | null;
  relativeVolume: number | null;
  marketCap: number | null;
  sources: ScreenerSource[];
};

export type CatalystSummary = {
  hasCatalyst: boolean;
  overallSentiment: "positive" | "negative" | "neutral";
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  headlines: NewsItem[];
};

export type HealthRating = "strong" | "moderate" | "weak";

export type HealthCheck = {
  score: number;
  rating: HealthRating;
  positives: string[];
  negatives: string[];
};

export type OpportunityVerdict = {
  recommendation: Recommendation;
  confidence: number;
  summary: string;
  bullishCount: number;
  bearishCount: number;
};

export type StockOpportunity = {
  candidate: VolumeCandidate;
  catalyst: CatalystSummary;
  health: HealthCheck;
  verdict: OpportunityVerdict;
  baseScore: number;
  regimeAdjustment: number;
  opportunityScore: number;
};

export type OpportunityScanReport = {
  scannedAt: string;
  universeSize: number;
  analyzedCount: number;
  minRelativeVolume: number;
  marketRegime: MarketRegime;
  marketRegimeConfidence: number;
  opportunities: StockOpportunity[];
  disclaimer: string;
};

// --- Watchlist ---

export type WatchlistItem = {
  id: string;
  symbol: string;
  quoteSymbol: string | null;
  assetType: AssetType;
  companyName: string | null;
  note: string | null;
  targetPrice: number | null;
  createdAt: string;
};

export type TimingPillarVerdict = "bullish" | "bearish" | "neutral" | "insufficient";

export type TimingPillar = {
  id: "flow" | "trend" | "pullback";
  label: string;
  verdict: TimingPillarVerdict;
  summary: string;
};

export type WatchlistTimingVerdict = "opportunity" | "watch" | "avoid";

export type WatchlistTimingEntry = {
  symbol: string;
  quoteSymbol: string;
  companyName: string | null;
  targetPrice: number | null;
  livePrice: number | null;
  verdict: WatchlistTimingVerdict;
  pillars: TimingPillar[];
  notes: string[];
  sources: Array<"watchlist" | "holding">;
};

export type WatchlistTimingReport = {
  entries: WatchlistTimingEntry[];
  disclaimer: string;
};
