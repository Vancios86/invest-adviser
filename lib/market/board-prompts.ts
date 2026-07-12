import { BOARD_DEFINITIONS, CORE_BOARD_ROLES } from "@/lib/market/board";
import type {
  BoardMemberOutput,
  BoardRole,
  MarketBoardReport,
  MarketSignal,
  MarketSnapshot,
} from "@/lib/types";

const JSON_OUTPUT_RULES = `
Return ONLY valid JSON matching the schema. No markdown fences.
Ground every point in the supplied market data. Do not invent prices, levels, events, or institution names.
Use 2-4 keyPoints and 0-3 watchItems. Write in clear, direct prose for a self-directed retail investor.`;

const SIGNAL_RULES = `
You receive a rules-engine baseline signal (risk_on | risk_off | neutral) and confidence. You MAY revise them if the data clearly supports a different read — for example when equities rally but VIX and yields both rise, or when cyclicals lead but flow shows distribution.
- If you change signal or confidence materially, explain why in a keyPoint.
- Do not flip to risk_on/risk_off without citing specific supplied metrics.
- Confidence must be between 0 and 1.`;

const PEER_AWARENESS = `
Other desk baselines are included for context. You may reference agreement or tension with another desk in a keyPoint or watchItem, but stay in your lane — do not speak for other desks.`;

export const BOARD_MEMBER_SYSTEM: Record<BoardRole, string> = {
  macro: `You are the ${BOARD_DEFINITIONS.macro.displayName} on a market advisory board (${BOARD_DEFINITIONS.macro.mandate}).

Your job is to read the cross-asset tape: equity indices, VIX, 10Y yields, the US dollar, and commodities. Lead with whether conditions favor or punish risk appetite, and call out contradictions (e.g. stocks up + VIX up, or yields rising while equities hold).
${SIGNAL_RULES}
${PEER_AWARENESS}
${JSON_OUTPUT_RULES}`,

  sector_rotation: `You are the ${BOARD_DEFINITIONS.sector_rotation.displayName} on a market advisory board (${BOARD_DEFINITIONS.sector_rotation.mandate}).

Your job is to interpret leadership and laggards: cyclicals vs defensives, sector breadth, and what today's rotation implies about growth vs safety preference. Name the sectors driving the message — not a generic market comment.
${SIGNAL_RULES}
${PEER_AWARENESS}
${JSON_OUTPUT_RULES}`,

  institutional_flow: `You are the ${BOARD_DEFINITIONS.institutional_flow.displayName} on a market advisory board (${BOARD_DEFINITIONS.institutional_flow.mandate}).

Your job is participation and inferred money flow: accumulation vs distribution by sector, relative volume spikes, and where conviction is strongest or weakest. Be explicit that flow is inferred from public price/volume — not proprietary order-flow feeds.
${SIGNAL_RULES}
${PEER_AWARENESS}
${JSON_OUTPUT_RULES}`,

  geopolitical: `You are the ${BOARD_DEFINITIONS.geopolitical.displayName} on a market advisory board (${BOARD_DEFINITIONS.geopolitical.mandate}).

Your job is to separate durable macro catalysts from headline noise: policy, geopolitics, earnings macro, and financial-stability themes. Weigh sentiment balance without letting one dramatic headline dominate. Note when coverage is thin.
${SIGNAL_RULES}
${PEER_AWARENESS}
${JSON_OUTPUT_RULES}`,

  chief_strategist: `You are the ${BOARD_DEFINITIONS.chief_strategist.displayName}, chairing the market advisory board (${BOARD_DEFINITIONS.chief_strategist.mandate}).

You review after macro, sector rotation, flow, and news desks have updated their views. Synthesize — do not repeat — into a coherent stance aligned with the draft regime in the payload.

Structure keyPoints to:
1) State the board's read on the environment (risk-on, risk-off, or mixed)
2) Name where desks agree (the core theme)
3) Name the most important disagreement (e.g. constructive macro vs distribution in tech)
4) Give practical posture: how a self-directed investor should lean (add, hold fire, trim, stay selective)

watchItems should capture the main risks to the view. You may adjust signal and confidence slightly to reflect how unified or split the board is.
When watchlist/portfolio timing data is present, connect the macro backdrop to names flagged as favorable entry or sideline.
${JSON_OUTPUT_RULES}`,
};

export const BOARD_MEMBER_SCHEMA = {
  type: "object",
  properties: {
    signal: {
      type: "string",
      enum: ["risk_on", "risk_off", "neutral"],
    },
    confidence: {
      type: "number",
    },
    keyPoints: { type: "array", items: { type: "string" } },
    watchItems: { type: "array", items: { type: "string" } },
  },
  required: ["signal", "confidence", "keyPoints", "watchItems"],
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
- Highlights the strongest cross-desk agreement and the main point of tension or dissent
- Integrates macro, sector rotation, money flow, and news themes that actually moved the board
- Closes with practical posture for decision-making
- Mentions watchlist/portfolio timing context when relevant names are in the payload
- Stays factual and grounded in the supplied data

Return ONLY valid JSON with executiveSummary. No markdown fences.`;

export type BoardMemberNarrative = {
  signal: MarketSignal;
  confidence: number;
  keyPoints: string[];
  watchItems: string[];
};

export type BoardSummaryResult = {
  executiveSummary: string;
};

export const CORE_BOARD_ENRICHMENT_ROLES = [...CORE_BOARD_ROLES] as BoardRole[];

export const CHIEF_BOARD_ENRICHMENT_ROLES: BoardRole[] = ["chief_strategist"];

export const ENRICHABLE_BOARD_ROLES: BoardRole[] = [
  ...CORE_BOARD_ENRICHMENT_ROLES,
  ...CHIEF_BOARD_ENRICHMENT_ROLES,
];

type CoreBoardRole = (typeof CORE_BOARD_ROLES)[number];

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
        summary: item.summary,
        sentiment: item.sentiment,
        source: item.source,
        publishedAt: item.publishedAt,
      })),
    },
  };
}

function flowSectorDigest(snapshot: MarketSnapshot) {
  return snapshot.sectors.map((sector) => ({
    sector: sector.sector,
    changePercent: sector.changePercent,
    relativeVolume: sector.relativeVolume,
    flowSignal: sector.flowSignal,
  }));
}

function watchlistTimingDigest(report: MarketBoardReport) {
  if (report.watchlistTiming.entries.length === 0) return null;

  return {
    disclaimer: report.watchlistTiming.disclaimer,
    entries: report.watchlistTiming.entries.map((entry) => ({
      symbol: entry.symbol,
      companyName: entry.companyName,
      source: entry.sources,
      verdict: entry.verdict,
      livePrice: entry.livePrice,
      targetPrice: entry.targetPrice,
      pillars: entry.pillars.map((pillar) => ({
        label: pillar.label,
        verdict: pillar.verdict,
        summary: pillar.summary,
      })),
    })),
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

function peerDeskSummaries(
  report: MarketBoardReport,
  role: BoardRole,
): Array<{
  role: BoardRole;
  displayName: string;
  signal: MarketSignal;
  confidence: number;
  keyPoints: string[];
  watchItems: string[];
}> {
  return report.members
    .filter(
      (entry) =>
        CORE_BOARD_ROLES.includes(entry.role as CoreBoardRole) &&
        entry.role !== role,
    )
    .map((entry) => ({
      role: entry.role,
      displayName: entry.displayName,
      signal: entry.signal,
      confidence: entry.confidence,
      keyPoints: entry.keyPoints,
      watchItems: entry.watchItems,
    }));
}

export function buildBoardMemberPayload(
  role: BoardRole,
  report: MarketBoardReport,
): string {
  const member = memberByRole(report, role);
  const digest = snapshotDigest(report.snapshot);
  const timing = watchlistTimingDigest(report);

  const base = {
    member: {
      role: member.role,
      displayName: member.displayName,
      baselineSignal: member.signal,
      baselineConfidence: member.confidence,
      keyPoints: member.keyPoints,
      watchItems: member.watchItems,
    },
    committeeRegime: report.regime,
    committeeConfidence: report.confidence,
    peerDesks: peerDeskSummaries(report, role),
    watchlistTiming: timing,
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
        {
          ...base,
          sectors: digest.sectors,
          breadth: digest.breadth,
        },
        null,
        2,
      );
    case "institutional_flow":
      return JSON.stringify(
        {
          ...base,
          sectorFlow: flowSectorDigest(report.snapshot),
          breadth: digest.breadth,
          heaviestParticipation: flowSectorDigest(report.snapshot)
            .filter((s) => s.relativeVolume !== null && s.relativeVolume >= 1.2)
            .sort((a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0))
            .slice(0, 5),
        },
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
      watchlistTiming: watchlistTimingDigest(report),
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
