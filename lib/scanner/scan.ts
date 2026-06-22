import { runAnalysisPipeline } from "@/lib/agents/pipeline";
import { fetchStockData } from "@/lib/analysis-data";
import { runBoardPipeline } from "@/lib/market/board";
import { fetchMarketSnapshot } from "@/lib/market/market-data";
import { assessHealth } from "@/lib/scanner/health";
import { fetchVolumeUniverse } from "@/lib/scanner/screener";
import type {
  CatalystSummary,
  MarketRegime,
  NewsSnapshot,
  OpportunityScanReport,
  OpportunityVerdict,
  Recommendation,
  StockOpportunity,
  VolumeCandidate,
} from "@/lib/types";

export const SCANNER_DISCLAIMER =
  "This opportunity scan is for informational purposes only and is not financial advice. Unusual volume and news catalysts can accompany both upside and downside moves; always do your own research before trading.";

const DEFAULT_MIN_RELATIVE_VOLUME = 1.5;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

type ScanOptions = {
  minRelativeVolume?: number;
  limit?: number;
};

function buildCatalyst(news: NewsSnapshot): CatalystSummary {
  return {
    hasCatalyst: news.items.length > 0,
    overallSentiment: news.overallSentiment,
    positiveCount: news.positiveCount,
    negativeCount: news.negativeCount,
    neutralCount: news.neutralCount,
    headlines: news.items.slice(0, 4),
  };
}

const RECOMMENDATION_BIAS: Record<Recommendation, number> = {
  buy: 25,
  watch: 10,
  hold: 4,
  sell: -18,
};

// How sensitive each verdict is to the macro backdrop. Long-leaning ideas
// (buy/watch) are rewarded in risk-on tapes and penalized in risk-off ones;
// defensive calls barely move.
const REGIME_SENSITIVITY: Record<Recommendation, number> = {
  buy: 1,
  watch: 0.7,
  hold: 0.4,
  sell: 0.2,
};

const MAX_REGIME_SWING = 12;

function computeRegimeAdjustment(
  regime: MarketRegime,
  regimeConfidence: number,
  recommendation: Recommendation,
): number {
  const direction = regime === "risk_on" ? 1 : regime === "risk_off" ? -1 : 0;
  if (direction === 0) return 0;

  const adjustment =
    direction *
    regimeConfidence *
    REGIME_SENSITIVITY[recommendation] *
    MAX_REGIME_SWING;

  return Math.round(adjustment);
}

function computeBaseScore(
  candidate: VolumeCandidate,
  catalyst: CatalystSummary,
  health: { score: number },
  verdict: OpportunityVerdict,
): number {
  let score = 0;

  // Volume conviction (caps the contribution so a 20x spike can't dominate).
  if (candidate.relativeVolume !== null) {
    score += Math.min(candidate.relativeVolume, 5) * 7;
  }

  // Fundamental health.
  score += health.score * 0.3;

  // Committee verdict, weighted by its confidence.
  score += RECOMMENDATION_BIAS[verdict.recommendation] * (0.5 + verdict.confidence / 2);

  // News catalyst.
  if (!catalyst.hasCatalyst) {
    score -= 6;
  } else if (catalyst.overallSentiment === "positive") {
    score += 10;
  } else if (catalyst.overallSentiment === "negative") {
    score -= 6;
  }

  return score;
}

async function analyzeCandidate(
  candidate: VolumeCandidate,
  regime: MarketRegime,
  regimeConfidence: number,
): Promise<StockOpportunity | null> {
  try {
    const data = await fetchStockData(candidate.symbol);

    const catalyst = buildCatalyst(data.news);
    const health = assessHealth(data.financials);

    const report = runAnalysisPipeline({
      symbol: candidate.symbol,
      companyName: data.financials.companyName,
      data,
    });

    const bullishCount = report.agentOutputs.filter(
      (agent) => agent.signal === "bullish",
    ).length;
    const bearishCount = report.agentOutputs.filter(
      (agent) => agent.signal === "bearish",
    ).length;

    const verdict: OpportunityVerdict = {
      recommendation: report.recommendation,
      confidence: report.confidence,
      summary: report.executiveSummary,
      bullishCount,
      bearishCount,
    };

    const baseScore = computeBaseScore(candidate, catalyst, health, verdict);
    const regimeAdjustment = computeRegimeAdjustment(
      regime,
      regimeConfidence,
      verdict.recommendation,
    );
    const opportunityScore = Math.round(
      Math.min(100, Math.max(0, baseScore + regimeAdjustment)),
    );

    return {
      candidate: {
        ...candidate,
        companyName: candidate.companyName ?? data.financials.companyName,
      },
      catalyst,
      health,
      verdict,
      baseScore: Math.round(Math.min(100, Math.max(0, baseScore))),
      regimeAdjustment,
      opportunityScore,
    };
  } catch (error) {
    console.error(`Failed to analyze candidate ${candidate.symbol}:`, error);
    return null;
  }
}

async function getMarketRegime(): Promise<{
  regime: MarketRegime;
  confidence: number;
}> {
  try {
    const snapshot = await fetchMarketSnapshot();
    const board = runBoardPipeline(snapshot);
    return { regime: board.regime, confidence: board.confidence };
  } catch (error) {
    console.error("Failed to read market regime for scan:", error);
    return { regime: "mixed", confidence: 0 };
  }
}

export async function runOpportunityScan(
  options: ScanOptions = {},
): Promise<OpportunityScanReport> {
  const minRelativeVolume =
    options.minRelativeVolume && options.minRelativeVolume > 0
      ? options.minRelativeVolume
      : DEFAULT_MIN_RELATIVE_VOLUME;
  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  const [universe, regimeContext] = await Promise.all([
    fetchVolumeUniverse(),
    getMarketRegime(),
  ]);

  const spikes = universe.filter(
    (candidate) =>
      candidate.relativeVolume !== null &&
      candidate.relativeVolume >= minRelativeVolume,
  );

  const shortlist = spikes.slice(0, limit);

  const settled = await Promise.allSettled(
    shortlist.map((candidate) =>
      analyzeCandidate(candidate, regimeContext.regime, regimeContext.confidence),
    ),
  );

  const opportunities = settled
    .filter(
      (result): result is PromiseFulfilledResult<StockOpportunity> =>
        result.status === "fulfilled" && result.value !== null,
    )
    .map((result) => result.value)
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  return {
    scannedAt: new Date().toISOString(),
    universeSize: universe.length,
    analyzedCount: opportunities.length,
    minRelativeVolume,
    marketRegime: regimeContext.regime,
    marketRegimeConfidence: regimeContext.confidence,
    opportunities,
    disclaimer: SCANNER_DISCLAIMER,
  };
}
