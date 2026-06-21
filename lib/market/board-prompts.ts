import { BOARD_DEFINITIONS } from "@/lib/market/board";
import type {
  BoardMemberOutput,
  BoardRole,
  MarketBoardReport,
  MarketSnapshot,
} from "@/lib/types";

const SHARED_GUARDRAILS = `
You MUST NOT change the provided signal (risk_on | risk_off | neutral) or confidence — they are fixed by the rules engine.
Return ONLY valid JSON matching the schema. No markdown fences.
Ground every point in the supplied market data. Do not invent prices, levels, events, or institution names.
Use 2-4 keyPoints and 0-3 watchItems. Write in clear, professional prose for a self-directed retail investor.`;

export const BOARD_MEMBER_SYSTEM: Record<BoardRole, string> = {
  macro: `You are the ${BOARD_DEFINITIONS.macro.displayName} on a market advisory board (${BOARD_DEFINITIONS.macro.mandate}).
Your lens is cross-asset: equity indices, volatility (VIX), rates (10Y yield), the US dollar, and commodities. Explain what the macro backdrop implies for risk appetite.
${SHARED_GUARDRAILS}`,

  sector_rotation: `You are the ${BOARD_DEFINITIONS.sector_rotation.displayName} on a market advisory board (${BOARD_DEFINITIONS.sector_rotation.mandate}).
Your lens is sector and style leadership: which sectors lead/lag and whether cyclicals or defensives are in favor. Explain what the rotation says about the market's risk posture.
${SHARED_GUARDRAILS}`,

  institutional_flow: `You are the ${BOARD_DEFINITIONS.institutional_flow.displayName} on a market advisory board (${BOARD_DEFINITIONS.institutional_flow.mandate}).
Your lens is participation and money flow inferred from relative volume and price (accumulation vs distribution). Be explicit that flow is inferred from public price/volume, not order-flow feeds. Highlight where conviction is strongest.
${SHARED_GUARDRAILS}`,

  geopolitical: `You are the ${BOARD_DEFINITIONS.geopolitical.displayName} on a market advisory board (${BOARD_DEFINITIONS.geopolitical.mandate}).
Your lens is the macro/financial news flow and event risk. Summarize the dominant narrative and its market implications without overstating any single headline.
${SHARED_GUARDRAILS}`,

  chief_strategist: `You are the ${BOARD_DEFINITIONS.chief_strategist.displayName}, chairing the market advisory board (${BOARD_DEFINITIONS.chief_strategist.mandate}).
Synthesize the macro, sector, flow, and news desks into a coherent, actionable stance aligned with the committee regime. keyPoints should give a clear read and concrete posture; watchItems should capture the main risks to the view.
${SHARED_GUARDRAILS}`,
};

export const BOARD_MEMBER_SCHEMA = {
  type: "object",
  properties: {
    keyPoints: { type: "array", items: { type: "string" } },
    watchItems: { type: "array", items: { type: "string" } },
  },
  required: ["keyPoints", "watchItems"],
} as const;

export const BOARD_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
  },
  required: ["executiveSummary"],
} as const;

export const BOARD_SUMMARY_SYSTEM = `You are the chief market strategist summarizing a market advisory board briefing for a self-directed retail investor.

Write a 3-5 sentence executive summary that:
- States the market regime (risk_on | risk_off | mixed) and conviction level (provided — do not change them)
- Integrates the strongest themes across macro, sector rotation, money flow, and news
- Closes with the board's practical posture for decision-making
- Stays factual and grounded in the supplied data

Return ONLY valid JSON with executiveSummary. No markdown fences.`;

export type BoardMemberNarrative = {
  keyPoints: string[];
  watchItems: string[];
};

export type BoardSummaryResult = {
  executiveSummary: string;
};

export const ENRICHABLE_BOARD_ROLES: BoardRole[] = [
  "macro",
  "sector_rotation",
  "institutional_flow",
  "geopolitical",
  "chief_strategist",
];

function snapshotDigest(snapshot: MarketSnapshot) {
  return {
    indices: snapshot.indices,
    volatility: snapshot.volatility,
    macro: snapshot.macro,
    sectors: snapshot.sectors,
    breadth: snapshot.breadth,
    news: {
      overallSentiment: snapshot.news.overallSentiment,
      counts: {
        positive: snapshot.news.positiveCount,
        negative: snapshot.news.negativeCount,
        neutral: snapshot.news.neutralCount,
      },
      headlines: snapshot.news.items.slice(0, 10).map((item) => ({
        title: item.title,
        sentiment: item.sentiment,
        source: item.source,
      })),
    },
  };
}

function memberByRole(
  report: MarketBoardReport,
  role: BoardRole,
): BoardMemberOutput {
  const member = report.members.find((entry) => entry.role === role);
  if (!member) throw new Error(`Missing board member: ${role}`);
  return member;
}

export function buildBoardMemberPayload(
  role: BoardRole,
  report: MarketBoardReport,
): string {
  const member = memberByRole(report, role);
  const digest = snapshotDigest(report.snapshot);

  const base = {
    member: {
      role: member.role,
      displayName: member.displayName,
      signal: member.signal,
      confidence: member.confidence,
      keyPoints: member.keyPoints,
      watchItems: member.watchItems,
    },
    committeeRegime: report.regime,
  };

  switch (role) {
    case "macro":
      return JSON.stringify(
        {
          ...base,
          indices: digest.indices,
          volatility: digest.volatility,
          macro: digest.macro,
        },
        null,
        2,
      );
    case "sector_rotation":
      return JSON.stringify(
        { ...base, sectors: digest.sectors, breadth: digest.breadth },
        null,
        2,
      );
    case "institutional_flow":
      return JSON.stringify(
        { ...base, sectors: digest.sectors, breadth: digest.breadth },
        null,
        2,
      );
    case "geopolitical":
      return JSON.stringify({ ...base, news: digest.news }, null, 2);
    case "chief_strategist":
      return JSON.stringify(
        {
          ...base,
          fullSnapshot: digest,
          deskSignals: report.members
            .filter((m) => m.role !== "chief_strategist")
            .map((m) => ({
              role: m.role,
              displayName: m.displayName,
              signal: m.signal,
              confidence: m.confidence,
              keyPoints: m.keyPoints,
              watchItems: m.watchItems,
            })),
        },
        null,
        2,
      );
  }
}

export function buildBoardSummaryPayload(
  report: MarketBoardReport,
  enrichedMembers: BoardMemberOutput[],
): string {
  return JSON.stringify(
    {
      regime: report.regime,
      confidence: report.confidence,
      baselineExecutiveSummary: report.executiveSummary,
      members: enrichedMembers.map((m) => ({
        role: m.role,
        displayName: m.displayName,
        signal: m.signal,
        confidence: m.confidence,
        keyPoints: m.keyPoints,
        watchItems: m.watchItems,
      })),
    },
    null,
    2,
  );
}
