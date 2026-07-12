import {
  AGENT_DEFINITIONS,
  CORE_ANALYST_ROLES,
} from "@/lib/agents/pipeline";
import type {
  AgentOutput,
  AgentRole,
  AgentSignal,
  AnalysisContext,
  AnalysisReport,
} from "@/lib/types";

const JSON_OUTPUT_RULES = `
Return ONLY valid JSON matching the schema. No markdown fences.
Ground every point in the supplied data. Do not invent numbers, events, or analyst names.
Use 2-4 keyPoints and 0-3 concerns. Write in clear, direct prose for a retail investor audience.`;

const SIGNAL_RULES = `
You receive a rules-engine baseline signal and confidence. You MAY revise them if the data clearly supports a different read — for example when the baseline underweights a material risk, overreacts to a single headline, or misses a strong volume/trend signal.
- If you change signal or confidence by more than one step (e.g. bullish → bearish), explain why in a keyPoint.
- Do not flip to bullish/bearish without citing specific supplied metrics.
- Confidence must be between 0 and 1 (0 = low conviction, 1 = high conviction).`;

const PEER_AWARENESS = `
Other desk baselines are included for context. You may reference agreement or tension with another desk in a keyPoint or concern, but stay in your lane — do not speak for other desks.`;

export const AGENT_GEMINI_SYSTEM: Record<AgentRole, string> = {
  research: `You are the ${AGENT_DEFINITIONS.research.displayName} on an investment committee (${AGENT_DEFINITIONS.research.department}).

Your job is to form an independent fundamental view: revenue and earnings quality, margins, balance-sheet strength, valuation (P/E, P/B, PEG), analyst consensus, and sector/industry context.

Lead with the single most important fundamental driver — growth, profitability, or valuation — then support it with numbers from the payload. Flag when fundamentals look strong but valuation or leverage limits upside.
${SIGNAL_RULES}
${PEER_AWARENESS}
${JSON_OUTPUT_RULES}`,

  technical: `You are the ${AGENT_DEFINITIONS.technical.displayName} on an investment committee (${AGENT_DEFINITIONS.technical.department}).

Your job is to read price structure and participation: trend (SMA20/50/150/200), RSI, 30-day performance, drawdown from recent highs, buy/sell volume split, CMF, relative/unusual volume, and panic-selling character.

State whether the chart favors continuation, reversal, or chop. Call out unusual volume and whether it confirms or contradicts the price trend. Mention timing-relevant signals (150-day trend slope, drawdown) when present.
${SIGNAL_RULES}
${PEER_AWARENESS}
${JSON_OUTPUT_RULES}`,

  news: `You are the ${AGENT_DEFINITIONS.news.displayName} on an investment committee (${AGENT_DEFINITIONS.news.department}).

Your job is to separate durable catalysts from noise: earnings, guidance, product, regulatory, or macro headlines vs. one-off sentiment. Weigh positive vs. negative coverage without letting a single dramatic headline dominate.

If coverage is thin, say so and keep confidence moderate. Connect the narrative to near-term risk or opportunity — not price targets.
${SIGNAL_RULES}
${PEER_AWARENESS}
${JSON_OUTPUT_RULES}`,

  risk: `You are the ${AGENT_DEFINITIONS.risk.displayName} on an investment committee (${AGENT_DEFINITIONS.risk.department}).

Your job is to stress-test the idea: beta/volatility, distance from 52-week high, concentration in the holder's portfolio, and unrealized gain/loss. You are allowed — and expected — to push bearish when risk is elevated even if other desks are optimistic.

Be direct about sizing, drawdown, and "what could go wrong." Frame position-specific risks when portfolio data is available.
${SIGNAL_RULES}
${PEER_AWARENESS}
${JSON_OUTPUT_RULES}`,

  portfolio_manager: `You are the ${AGENT_DEFINITIONS.portfolio_manager.displayName} on an investment committee (${AGENT_DEFINITIONS.portfolio_manager.department}).

You chair the desk review after research, technical, news, and risk have updated their views. Your job is to synthesize — not repeat — their inputs into a coherent committee stance aligned with the draft recommendation in the payload.

Structure your keyPoints to:
1) Name where desks agree (the core thesis)
2) Name the most important disagreement or tension (e.g. strong fundamentals vs. extended chart)
3) State what the committee recommendation implies for action (buy/hold/sell/watch) and why

Concerns should capture the best reasons to wait, size down, or revisit. You may adjust signal and confidence slightly to reflect how unified or split the committee is.
${JSON_OUTPUT_RULES}`,

  compliance: `You are the ${AGENT_DEFINITIONS.compliance.displayName} on an investment committee (${AGENT_DEFINITIONS.compliance.department}).

Rewrite the compliance keyPoints and concerns in plain language. Preserve the meaning of the investment disclaimer — this is not financial advice.
Keep tone neutral and factual. Do not add new compliance claims beyond the baseline.
${JSON_OUTPUT_RULES}`,
};

export const GEMINI_AGENT_NARRATIVE_SCHEMA = {
  type: "object",
  properties: {
    signal: {
      type: "string",
      enum: ["bullish", "bearish", "neutral"],
    },
    confidence: {
      type: "number",
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
  required: ["signal", "confidence", "keyPoints", "concerns"],
} as const;

export const GEMINI_COMPLIANCE_NARRATIVE_SCHEMA = {
  type: "object",
  properties: {
    keyPoints: {
      type: "array",
      items: { type: "string" },
    },
    concerns: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["keyPoints", "concerns"],
} as const;

export const GEMINI_EXECUTIVE_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
  },
  required: ["executiveSummary"],
} as const;

export const GEMINI_EXECUTIVE_SUMMARY_SYSTEM = `You are the chief investment officer summarizing a multi-agent committee report for a retail investor.

Write a 2-4 sentence executive summary that:
- States the committee recommendation and confidence level (provided — do not change them)
- Highlights the strongest cross-desk agreement and the main point of tension or dissent
- Integrates fundamentals, technicals, news, and risk themes that actually moved the vote
- Mentions position context when available
- Stays factual and grounded in the supplied data

Return ONLY valid JSON with executiveSummary. No markdown fences.`;

export type GeminiAgentNarrative = {
  signal: AgentSignal;
  confidence: number;
  keyPoints: string[];
  concerns: string[];
};

export type GeminiComplianceNarrative = {
  keyPoints: string[];
  concerns: string[];
};

export type GeminiExecutiveSummaryResult = {
  executiveSummary: string;
};

function baselineAgent(report: AnalysisReport, role: AgentRole): AgentOutput {
  const agent = report.agentOutputs.find((entry) => entry.role === role);
  if (!agent) {
    throw new Error(`Missing baseline agent: ${role}`);
  }
  return agent;
}

function peerDeskSummaries(
  report: AnalysisReport,
  role: AgentRole,
): Array<{
  role: AgentRole;
  displayName: string;
  signal: AgentSignal;
  confidence: number;
  keyPoints: string[];
  concerns: string[];
}> {
  return report.agentOutputs
    .filter(
      (entry) =>
        CORE_ANALYST_ROLES.includes(entry.role as (typeof CORE_ANALYST_ROLES)[number]) &&
        entry.role !== role,
    )
    .map((entry) => ({
      role: entry.role,
      displayName: entry.displayName,
      signal: entry.signal,
      confidence: entry.confidence,
      keyPoints: entry.keyPoints,
      concerns: entry.concerns,
    }));
}

export function buildAgentGeminiPayload(
  role: AgentRole,
  context: AnalysisContext,
  report: AnalysisReport,
): string {
  const agent = baselineAgent(report, role);
  const base = {
    symbol: context.symbol,
    companyName: context.companyName,
    agent: {
      role: agent.role,
      displayName: agent.displayName,
      baselineSignal: agent.signal,
      baselineConfidence: agent.confidence,
      keyPoints: agent.keyPoints,
      concerns: agent.concerns,
    },
    committee: {
      recommendation: report.recommendation,
      confidence: report.confidence,
    },
    peerDesks: peerDeskSummaries(report, role),
  };

  switch (role) {
    case "research":
      return JSON.stringify(
        {
          ...base,
          financials: {
            sector: context.data.financials.sector,
            industry: context.data.financials.industry,
            revenueGrowth: context.data.financials.revenueGrowth,
            profitMargins: context.data.financials.profitMargins,
            operatingMargins: context.data.financials.operatingMargins,
            returnOnEquity: context.data.financials.returnOnEquity,
            returnOnAssets: context.data.financials.returnOnAssets,
            debtToEquity: context.data.financials.debtToEquity,
            currentRatio: context.data.financials.currentRatio,
            trailingPE: context.data.financials.trailingPE,
            forwardPE: context.data.financials.forwardPE,
            pegRatio: context.data.financials.pegRatio,
            priceToBook: context.data.financials.priceToBook,
            targetMeanPrice: context.data.financials.targetMeanPrice,
            recommendationMean: context.data.financials.recommendationMean,
            analystStrongBuy: context.data.financials.analystStrongBuy,
            analystBuy: context.data.financials.analystBuy,
            analystHold: context.data.financials.analystHold,
            analystSell: context.data.financials.analystSell,
            analystStrongSell: context.data.financials.analystStrongSell,
          },
        },
        null,
        2,
      );

    case "technical":
      return JSON.stringify(
        {
          ...base,
          indicators: context.data.indicators,
        },
        null,
        2,
      );

    case "news":
      return JSON.stringify(
        {
          ...base,
          news: {
            overallSentiment: context.data.news.overallSentiment,
            counts: {
              positive: context.data.news.positiveCount,
              negative: context.data.news.negativeCount,
              neutral: context.data.news.neutralCount,
            },
            headlines: context.data.news.items.slice(0, 10).map((item) => ({
              title: item.title,
              summary: item.summary,
              sentiment: item.sentiment,
              source: item.source,
              publishedAt: item.publishedAt,
            })),
          },
        },
        null,
        2,
      );

    case "risk":
      return JSON.stringify(
        {
          ...base,
          financials: {
            beta: context.data.financials.beta,
            fiftyTwoWeekHigh: context.data.financials.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: context.data.financials.fiftyTwoWeekLow,
          },
          indicators: {
            currentPrice: context.data.indicators.currentPrice,
            drawdownFromHigh20Pct: context.data.indicators.drawdownFromHigh20Pct,
            recentPanicSell: context.data.indicators.recentPanicSell,
          },
          position: context.position ?? null,
          portfolioSummary: context.portfolioSummary ?? null,
        },
        null,
        2,
      );

    case "portfolio_manager":
      return JSON.stringify(
        {
          ...base,
          position: context.position ?? null,
          portfolioSummary: context.portfolioSummary ?? null,
          deskSignals: report.agentOutputs
            .filter((entry) =>
              CORE_ANALYST_ROLES.includes(
                entry.role as (typeof CORE_ANALYST_ROLES)[number],
              ),
            )
            .map((entry) => ({
              role: entry.role,
              displayName: entry.displayName,
              signal: entry.signal,
              confidence: entry.confidence,
              keyPoints: entry.keyPoints,
              concerns: entry.concerns,
            })),
        },
        null,
        2,
      );

    case "compliance":
      return JSON.stringify(base, null, 2);
  }
}

export function buildExecutiveSummaryPayload(
  context: AnalysisContext,
  report: AnalysisReport,
  enrichedAgents: AgentOutput[],
): string {
  return JSON.stringify(
    {
      symbol: context.symbol,
      companyName: context.companyName,
      recommendation: report.recommendation,
      confidence: report.confidence,
      position: context.position ?? null,
      baselineExecutiveSummary: report.executiveSummary,
      agents: enrichedAgents.map((agent) => ({
        role: agent.role,
        displayName: agent.displayName,
        signal: agent.signal,
        confidence: agent.confidence,
        keyPoints: agent.keyPoints,
        concerns: agent.concerns,
      })),
    },
    null,
    2,
  );
}

export const CORE_ENRICHMENT_ROLES = [...CORE_ANALYST_ROLES] as AgentRole[];

export const SYNTHESIS_ENRICHMENT_ROLES: AgentRole[] = [
  "portfolio_manager",
  "compliance",
];

export const ENRICHABLE_AGENT_ROLES: AgentRole[] = [
  ...CORE_ENRICHMENT_ROLES,
  ...SYNTHESIS_ENRICHMENT_ROLES,
];
