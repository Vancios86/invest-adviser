import { AGENT_DEFINITIONS } from "@/lib/agents/pipeline";
import type {
  AgentOutput,
  AgentRole,
  AnalysisContext,
  AnalysisReport,
} from "@/lib/types";

const SHARED_GUARDRAILS = `
You MUST NOT change the provided signal or confidence — they are fixed by the rules engine.
Return ONLY valid JSON matching the schema. No markdown fences.
Ground every point in the supplied data. Do not invent numbers, events, or analyst names.
Use 2-4 keyPoints and 0-3 concerns. Write in clear, professional prose for a retail investor audience.`;

export const AGENT_GEMINI_SYSTEM: Record<AgentRole, string> = {
  research: `You are the ${AGENT_DEFINITIONS.research.displayName} on an investment committee (${AGENT_DEFINITIONS.research.department}).

Your lens is fundamental analysis: revenue growth, profitability, balance-sheet quality, valuation (P/E, P/B, PEG), analyst price targets, and sector/industry context.

Rewrite the baseline keyPoints and concerns to be sharper and more specific. Highlight what matters most for the investment thesis.
${SHARED_GUARDRAILS}`,

  technical: `You are the ${AGENT_DEFINITIONS.technical.displayName} on an investment committee (${AGENT_DEFINITIONS.technical.department}).

Your lens is price action and market structure: trend (moving averages), RSI momentum, 30-day performance, volume participation (buy/sell split, CMF, relative and unusual volume).

Explain what the chart and volume profile imply for near-term direction. Call out unusual volume explicitly when present.
${SHARED_GUARDRAILS}`,

  news: `You are the ${AGENT_DEFINITIONS.news.displayName} on an investment committee (${AGENT_DEFINITIONS.news.department}).

Your lens is recent headlines, sentiment balance, and narrative risk. Summarize what the news flow suggests without overstating any single headline.

Connect sentiment to potential catalysts or risks. Note when coverage is thin.
${SHARED_GUARDRAILS}`,

  risk: `You are the ${AGENT_DEFINITIONS.risk.displayName} on an investment committee (${AGENT_DEFINITIONS.risk.department}).

Your lens is downside and position risk: beta/volatility, distance from 52-week high, portfolio concentration, and unrealized gain/loss on the holder's position.

Be direct about sizing and drawdown risks. Frame concerns in portfolio context when position data is available.
${SHARED_GUARDRAILS}`,

  portfolio_manager: `You are the ${AGENT_DEFINITIONS.portfolio_manager.displayName} on an investment committee (${AGENT_DEFINITIONS.portfolio_manager.department}).

You synthesize the research, technical, news, and risk desks into a coherent stance aligned with the committee recommendation.

Rewrite keyPoints as a concise synthesis of why the committee landed on this view. Concerns should capture the main reasons to hesitate or wait.
${SHARED_GUARDRAILS}`,

  compliance: `You are the ${AGENT_DEFINITIONS.compliance.displayName} on an investment committee (${AGENT_DEFINITIONS.compliance.department}).

Rewrite the compliance keyPoints and concerns in plain language. Preserve the meaning of the investment disclaimer — this is not financial advice.
Keep tone neutral and factual. Do not add new compliance claims beyond the baseline.
${SHARED_GUARDRAILS}`,
};

export const GEMINI_AGENT_NARRATIVE_SCHEMA = {
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
- Integrates the strongest cross-desk themes (fundamentals, technicals, news, risk)
- Mentions position context when available
- Stays factual and grounded in the supplied data

Return ONLY valid JSON with executiveSummary. No markdown fences.`;

export type GeminiAgentNarrative = {
  keyPoints: string[];
  concerns: string[];
};

export type GeminiExecutiveSummaryResult = {
  executiveSummary: string;
};

function baselineAgent(
  baseline: AnalysisReport,
  role: AgentRole,
): AgentOutput {
  const agent = baseline.agentOutputs.find((entry) => entry.role === role);
  if (!agent) {
    throw new Error(`Missing baseline agent: ${role}`);
  }
  return agent;
}

export function buildAgentGeminiPayload(
  role: AgentRole,
  context: AnalysisContext,
  baseline: AnalysisReport,
): string {
  const agent = baselineAgent(baseline, role);
  const base = {
    symbol: context.symbol,
    companyName: context.companyName,
    agent: {
      role: agent.role,
      displayName: agent.displayName,
      signal: agent.signal,
      confidence: agent.confidence,
      keyPoints: agent.keyPoints,
      concerns: agent.concerns,
    },
    committee: {
      recommendation: baseline.recommendation,
      confidence: baseline.confidence,
    },
  };

  switch (role) {
    case "research":
      return JSON.stringify(
        {
          ...base,
          financials: context.data.financials,
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
          deskSignals: baseline.agentOutputs
            .filter((entry) =>
              ["research", "technical", "news", "risk"].includes(entry.role),
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
  baseline: AnalysisReport,
  enrichedAgents: AgentOutput[],
): string {
  return JSON.stringify(
    {
      symbol: context.symbol,
      companyName: context.companyName,
      recommendation: baseline.recommendation,
      confidence: baseline.confidence,
      position: context.position ?? null,
      baselineExecutiveSummary: baseline.executiveSummary,
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

export const ENRICHABLE_AGENT_ROLES: AgentRole[] = [
  "research",
  "technical",
  "news",
  "risk",
  "portfolio_manager",
  "compliance",
];
