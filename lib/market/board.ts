import type {
  BoardMemberOutput,
  BoardRole,
  MarketBoardReport,
  MarketInstrument,
  MarketRegime,
  MarketSignal,
  MarketSnapshot,
  SectorPerformance,
} from "@/lib/types";
import { WATCHLIST_TIMING_DISCLAIMER } from "@/lib/watchlist/timing";

export const BOARD_DEFINITIONS: Record<
  BoardRole,
  { displayName: string; mandate: string }
> = {
  macro: {
    displayName: "Macro Strategist",
    mandate: "Macro & Cross-Asset Strategy",
  },
  sector_rotation: {
    displayName: "Sector Rotation Analyst",
    mandate: "Sector & Style Rotation",
  },
  institutional_flow: {
    displayName: "Institutional Flow Tracker",
    mandate: "Liquidity & Money Flow",
  },
  geopolitical: {
    displayName: "Geopolitical & News Analyst",
    mandate: "Macro News & Event Risk",
  },
  chief_strategist: {
    displayName: "Chief Market Strategist",
    mandate: "Investment Committee Chair",
  },
};

export const BOARD_DISCLAIMER =
  "This market briefing is for informational purposes only and is not financial advice. Institutional flow is inferred from public price and volume data, not from regulatory filings or proprietary order-flow feeds. Always do your own research before making investment decisions.";

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function avgChange(instruments: MarketInstrument[]): number | null {
  const values = instruments
    .map((i) => i.changePercent)
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function signalFromScore(score: number): MarketSignal {
  if (score >= 1) return "risk_on";
  if (score <= -1) return "risk_off";
  return "neutral";
}

function topSectors(
  sectors: SectorPerformance[],
  count: number,
  best: boolean,
): SectorPerformance[] {
  return [...sectors]
    .filter((s) => s.changePercent !== null)
    .sort((a, b) =>
      best
        ? (b.changePercent ?? 0) - (a.changePercent ?? 0)
        : (a.changePercent ?? 0) - (b.changePercent ?? 0),
    )
    .slice(0, count);
}

const CYCLICAL_SECTORS = new Set([
  "Technology",
  "Consumer Discretionary",
  "Financials",
  "Industrials",
  "Materials",
  "Energy",
  "Communication Services",
]);

const DEFENSIVE_SECTORS = new Set([
  "Health Care",
  "Consumer Staples",
  "Utilities",
  "Real Estate",
]);

function fmtPct(value: number | null): string {
  if (value === null) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function runMacroStrategist(snapshot: MarketSnapshot): BoardMemberOutput {
  const keyPoints: string[] = [];
  const watchItems: string[] = [];
  let score = 0;

  const indexAvg = avgChange(snapshot.indices);
  if (indexAvg !== null) {
    if (indexAvg > 0.4) {
      score += 1;
      keyPoints.push(
        `Broad equity benchmarks are higher on the day (avg ${fmtPct(indexAvg)} across major indices).`,
      );
    } else if (indexAvg < -0.4) {
      score -= 1;
      keyPoints.push(
        `Major indices are under pressure (avg ${fmtPct(indexAvg)}).`,
      );
    } else {
      keyPoints.push(`Index action is mixed-to-flat (avg ${fmtPct(indexAvg)}).`);
    }
  }

  const vix = snapshot.volatility?.price ?? null;
  if (vix !== null) {
    if (vix < 16) {
      score += 1;
      keyPoints.push(`Volatility is subdued with the VIX near ${vix.toFixed(1)}.`);
    } else if (vix > 24) {
      score -= 1;
      watchItems.push(
        `Elevated volatility — VIX at ${vix.toFixed(1)} signals heightened hedging demand.`,
      );
    } else {
      keyPoints.push(`VIX is in a normal range (${vix.toFixed(1)}).`);
    }
  }

  const tnx = snapshot.macro.find((m) => m.symbol === "^TNX");
  if (tnx?.changePercent !== null && tnx?.changePercent !== undefined) {
    if (tnx.changePercent > 1.5) {
      score -= 0.5;
      watchItems.push(
        `The 10Y Treasury yield is rising sharply (${fmtPct(tnx.changePercent)}), a headwind for long-duration risk assets.`,
      );
    } else if (tnx.changePercent < -1.5) {
      score += 0.5;
      keyPoints.push(
        `Falling 10Y yields (${fmtPct(tnx.changePercent)}) are easing financial conditions.`,
      );
    }
  }

  const dollar = snapshot.macro.find((m) => m.symbol === "DX-Y.NYB");
  if (dollar?.changePercent !== null && dollar?.changePercent !== undefined) {
    if (dollar.changePercent > 0.5) {
      watchItems.push(
        `A strengthening US dollar (${fmtPct(dollar.changePercent)}) can pressure multinationals and commodities.`,
      );
    }
  }

  if (keyPoints.length === 0) {
    keyPoints.push("Cross-asset signals are broadly neutral today.");
  }

  return {
    role: "macro",
    displayName: BOARD_DEFINITIONS.macro.displayName,
    signal: signalFromScore(score),
    confidence: clamp(0.45 + Math.abs(score) * 0.15),
    keyPoints,
    watchItems,
  };
}

function runSectorRotation(snapshot: MarketSnapshot): BoardMemberOutput {
  const keyPoints: string[] = [];
  const watchItems: string[] = [];
  let score = 0;

  const leaders = topSectors(snapshot.sectors, 3, true);
  const laggards = topSectors(snapshot.sectors, 3, false);

  if (leaders.length > 0) {
    keyPoints.push(
      `Leadership: ${leaders
        .map((s) => `${s.sector} (${fmtPct(s.changePercent)})`)
        .join(", ")}.`,
    );
  }
  if (laggards.length > 0) {
    keyPoints.push(
      `Lagging: ${laggards
        .map((s) => `${s.sector} (${fmtPct(s.changePercent)})`)
        .join(", ")}.`,
    );
  }

  const cyclicalLead = leaders.filter((s) =>
    CYCLICAL_SECTORS.has(s.sector),
  ).length;
  const defensiveLead = leaders.filter((s) =>
    DEFENSIVE_SECTORS.has(s.sector),
  ).length;

  if (cyclicalLead > defensiveLead) {
    score += 1;
    keyPoints.push(
      "Cyclical sectors are leading — consistent with a risk-on, pro-growth rotation.",
    );
  } else if (defensiveLead > cyclicalLead) {
    score -= 1;
    keyPoints.push(
      "Defensive sectors are leading — a more cautious, risk-off posture.",
    );
    watchItems.push(
      "Defensive leadership often precedes choppier or down-trending tape.",
    );
  } else {
    keyPoints.push("No clear cyclical-vs-defensive rotation today.");
  }

  return {
    role: "sector_rotation",
    displayName: BOARD_DEFINITIONS.sector_rotation.displayName,
    signal: signalFromScore(score),
    confidence: clamp(0.45 + Math.abs(score) * 0.15),
    keyPoints,
    watchItems,
  };
}

function runInstitutionalFlow(snapshot: MarketSnapshot): BoardMemberOutput {
  const keyPoints: string[] = [];
  const watchItems: string[] = [];
  let score = 0;

  const accumulation = snapshot.sectors.filter(
    (s) => s.flowSignal === "accumulation",
  );
  const distribution = snapshot.sectors.filter(
    (s) => s.flowSignal === "distribution",
  );

  if (accumulation.length > 0) {
    keyPoints.push(
      `Above-average volume confirming gains (accumulation) in: ${accumulation
        .map((s) => s.sector)
        .join(", ")}.`,
    );
  }
  if (distribution.length > 0) {
    keyPoints.push(
      `Above-average volume on declines (distribution) in: ${distribution
        .map((s) => s.sector)
        .join(", ")}.`,
    );
  }

  score += accumulation.length * 0.5 - distribution.length * 0.5;

  const heavyVolume = snapshot.sectors
    .filter((s) => s.relativeVolume !== null && s.relativeVolume >= 1.3)
    .sort((a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0));

  if (heavyVolume.length > 0) {
    keyPoints.push(
      `Heaviest participation: ${heavyVolume
        .slice(0, 3)
        .map((s) => `${s.sector} (${(s.relativeVolume ?? 0).toFixed(1)}x avg)`)
        .join(", ")}.`,
    );
  } else {
    watchItems.push(
      "Overall participation is near average — conviction behind today's move is limited.",
    );
  }

  if (accumulation.length === 0 && distribution.length === 0) {
    keyPoints.push(
      "No decisive accumulation or distribution flagged across sectors today.",
    );
  }

  return {
    role: "institutional_flow",
    displayName: BOARD_DEFINITIONS.institutional_flow.displayName,
    signal: signalFromScore(score),
    confidence: clamp(0.4 + Math.abs(score) * 0.12),
    keyPoints,
    watchItems,
  };
}

function runGeopolitical(snapshot: MarketSnapshot): BoardMemberOutput {
  const keyPoints: string[] = [];
  const watchItems: string[] = [];
  let score = 0;

  const { news } = snapshot;
  if (news.items.length === 0) {
    keyPoints.push("No major market headlines retrieved at this time.");
  } else {
    if (news.overallSentiment === "positive") {
      score += 1;
      keyPoints.push(
        `Headline flow skews constructive (${news.positiveCount} positive vs ${news.negativeCount} negative of ${news.items.length}).`,
      );
    } else if (news.overallSentiment === "negative") {
      score -= 1;
      keyPoints.push(
        `Headline flow skews cautious (${news.negativeCount} negative vs ${news.positiveCount} positive of ${news.items.length}).`,
      );
      watchItems.push("Negative news momentum can compress risk appetite quickly.");
    } else {
      keyPoints.push(
        `News flow is balanced (${news.positiveCount} positive / ${news.negativeCount} negative / ${news.neutralCount} neutral).`,
      );
    }

    const topHeadlines = news.items.slice(0, 3).map((i) => i.title);
    if (topHeadlines.length > 0) {
      keyPoints.push(`Top headlines: ${topHeadlines.join(" | ")}`);
    }
  }

  return {
    role: "geopolitical",
    displayName: BOARD_DEFINITIONS.geopolitical.displayName,
    signal: signalFromScore(score),
    confidence: clamp(0.4 + Math.abs(score) * 0.15),
    keyPoints,
    watchItems,
  };
}

function regimeFromMembers(members: BoardMemberOutput[]): {
  regime: MarketRegime;
  confidence: number;
} {
  let net = 0;
  let weight = 0;
  for (const member of members) {
    const dir =
      member.signal === "risk_on" ? 1 : member.signal === "risk_off" ? -1 : 0;
    net += dir * member.confidence;
    weight += member.confidence;
  }

  const normalized = weight > 0 ? net / weight : 0;
  let regime: MarketRegime = "mixed";
  if (normalized > 0.25) regime = "risk_on";
  else if (normalized < -0.25) regime = "risk_off";

  return { regime, confidence: clamp(0.5 + Math.abs(normalized) * 0.4) };
}

function runChiefStrategist(
  snapshot: MarketSnapshot,
  members: BoardMemberOutput[],
  regime: MarketRegime,
  confidence: number,
): BoardMemberOutput {
  const keyPoints: string[] = [];
  const watchItems: string[] = [];

  const regimeLabel =
    regime === "risk_on"
      ? "risk-on"
      : regime === "risk_off"
        ? "risk-off"
        : "mixed / transitional";

  keyPoints.push(
    `The board reads the current backdrop as ${regimeLabel} (${(confidence * 100).toFixed(0)}% conviction).`,
  );

  const riskOn = members.filter((m) => m.signal === "risk_on").length;
  const riskOff = members.filter((m) => m.signal === "risk_off").length;
  keyPoints.push(
    `Internal vote: ${riskOn} risk-on, ${riskOff} risk-off, ${members.length - riskOn - riskOff} neutral.`,
  );

  if (regime === "risk_on") {
    keyPoints.push(
      "Bias toward leadership groups and adding selectively; let winners run while breadth is supportive.",
    );
  } else if (regime === "risk_off") {
    keyPoints.push(
      "Favor capital preservation: trim extended positions, raise quality, and keep some dry powder.",
    );
  } else {
    keyPoints.push(
      "Stay balanced and patient — avoid large directional bets until leadership and flows align.",
    );
  }

  for (const member of members) {
    for (const item of member.watchItems) {
      if (!watchItems.includes(item)) watchItems.push(item);
    }
  }

  return {
    role: "chief_strategist",
    displayName: BOARD_DEFINITIONS.chief_strategist.displayName,
    signal:
      regime === "risk_on"
        ? "risk_on"
        : regime === "risk_off"
          ? "risk_off"
          : "neutral",
    confidence,
    keyPoints,
    watchItems: watchItems.slice(0, 5),
  };
}

function buildExecutiveSummary(
  regime: MarketRegime,
  confidence: number,
  members: BoardMemberOutput[],
): string {
  const regimeLabel =
    regime === "risk_on"
      ? "risk-on"
      : regime === "risk_off"
        ? "risk-off"
        : "mixed";
  const riskOn = members.filter((m) => m.signal === "risk_on").length;
  const riskOff = members.filter((m) => m.signal === "risk_off").length;

  return `The board of advisers sees a ${regimeLabel} market environment at ${(confidence * 100).toFixed(0)}% conviction, with ${riskOn} desk(s) leaning risk-on and ${riskOff} leaning risk-off across macro, sector rotation, money flow, and news.`;
}

export function runBoardPipeline(snapshot: MarketSnapshot): MarketBoardReport {
  const macro = runMacroStrategist(snapshot);
  const sectorRotation = runSectorRotation(snapshot);
  const flow = runInstitutionalFlow(snapshot);
  const geopolitical = runGeopolitical(snapshot);

  const deskMembers = [macro, sectorRotation, flow, geopolitical];
  const { regime, confidence } = regimeFromMembers(deskMembers);

  const chief = runChiefStrategist(snapshot, deskMembers, regime, confidence);

  return {
    regime,
    confidence,
    executiveSummary: buildExecutiveSummary(regime, confidence, deskMembers),
    members: [...deskMembers, chief],
    watchlistTiming: { entries: [], disclaimer: WATCHLIST_TIMING_DISCLAIMER },
    snapshot,
    generatedAt: new Date().toISOString(),
    analysisMode: "rules",
    disclaimer: BOARD_DISCLAIMER,
  };
}
