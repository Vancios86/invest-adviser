import type {
  AgentRole,
  AnalysisContext,
  AnalysisReport,
} from "@/lib/types";

export function buildGeminiContextPayload(
  context: AnalysisContext,
  baseline: AnalysisReport,
): string {
  return JSON.stringify(
    {
      symbol: context.symbol,
      companyName: context.companyName,
      position: context.position ?? null,
      portfolioSummary: context.portfolioSummary ?? null,
      financials: context.data.financials,
      indicators: context.data.indicators,
      news: {
        overallSentiment: context.data.news.overallSentiment,
        counts: {
          positive: context.data.news.positiveCount,
          negative: context.data.news.negativeCount,
          neutral: context.data.news.neutralCount,
        },
        headlines: context.data.news.items.slice(0, 8).map((item) => ({
          title: item.title,
          sentiment: item.sentiment,
          source: item.source,
        })),
      },
      baseline: {
        recommendation: baseline.recommendation,
        confidence: baseline.confidence,
        agents: baseline.agentOutputs.map((agent) => ({
          role: agent.role,
          signal: agent.signal,
          confidence: agent.confidence,
          keyPoints: agent.keyPoints,
          concerns: agent.concerns,
        })),
      },
    },
    null,
    2,
  );
}

export const GEMINI_ENRICHMENT_SYSTEM = `You are the narrative layer for a multi-agent investment analysis desk.
You receive structured market data and a baseline rule-based committee report.

Your job is to rewrite agent commentary and the executive summary in clear, professional prose.
You MUST NOT change:
- recommendation (buy | hold | sell | watch)
- any agent's signal (bullish | bearish | neutral)
- any agent's confidence number (0 to 1)

You MAY:
- Rewrite keyPoints and concerns to be more insightful and specific, grounded in the data
- Write a richer executiveSummary (2-4 sentences) explaining the committee's view
- Add nuance while staying factual — no invented numbers or events

Return ONLY valid JSON matching the schema. No markdown fences.`;

export const GEMINI_ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    agents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: {
            type: "string",
            enum: [
              "research",
              "technical",
              "news",
              "risk",
              "portfolio_manager",
              "compliance",
            ],
          },
          keyPoints: {
            type: "array",
            items: { type: "string" },
          },
          concerns: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["role", "keyPoints", "concerns"],
      },
    },
  },
  required: ["executiveSummary", "agents"],
} as const;

export type GeminiEnrichmentResult = {
  executiveSummary: string;
  agents: Array<{
    role: AgentRole;
    keyPoints: string[];
    concerns: string[];
  }>;
};
