import {
  buildRotationNote,
  resolveSpdrSector,
  SECTOR_ETF_DEFS,
  sectorRank,
} from "@/lib/market/sector-flow";
import type { MarketSnapshot, SectorMacroSnapshot } from "@/lib/types";

export const SECTOR_MACRO_DISCLAIMER =
  "Sector flow is inferred from SPDR ETF price and volume versus its 3-month average — a proxy for institutional participation, not direct fund-flow data.";

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function fmtRelativeVolume(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}x avg`;
}

function flowHeadline(
  flowSignal: SectorMacroSnapshot["flowSignal"],
  sector: string,
): string {
  if (flowSignal === "accumulation") {
    return `Institutional flow proxy: money moving into ${sector}`;
  }
  if (flowSignal === "distribution") {
    return `Institutional flow proxy: money moving out of ${sector}`;
  }
  return `No strong flow signal in ${sector} today`;
}

function flowSummary(params: {
  etfSymbol: string;
  etfName: string;
  sector: string;
  changePercent: number | null;
  relativeVolume: number | null;
  flowSignal: SectorMacroSnapshot["flowSignal"];
  sectorRank: number | null;
  sectorsTotal: number;
}): string {
  const {
    etfSymbol,
    etfName,
    sector,
    changePercent,
    relativeVolume,
    flowSignal,
    sectorRank: rank,
    sectorsTotal,
  } = params;

  const pricePart =
    changePercent !== null
      ? `${etfSymbol} is ${fmtPct(changePercent)} on ${fmtRelativeVolume(relativeVolume)} volume`
      : `${etfName} (${etfSymbol}) flow data is limited today`;

  const rankPart =
    rank !== null
      ? ` — ranks #${rank} of ${sectorsTotal} S&P sectors by performance`
      : "";

  if (flowSignal === "accumulation") {
    return `${pricePart}, suggesting elevated buying interest in ${sector}${rankPart}.`;
  }
  if (flowSignal === "distribution") {
    return `${pricePart}, suggesting elevated selling pressure in ${sector}${rankPart}.`;
  }

  if (changePercent !== null && Math.abs(changePercent) >= 0.25) {
    const direction = changePercent > 0 ? "up" : "down";
    return `${etfSymbol} is ${direction} ${fmtPct(changePercent)} but volume is near normal — participation does not confirm a strong institutional flow${rankPart}.`;
  }

  return `${etfSymbol} is trading with average participation today — no clear institutional inflow or outflow signal${rankPart}.`;
}

export function buildSectorMacroSnapshot(params: {
  sector: string | null;
  industry: string | null;
  marketSnapshot: MarketSnapshot;
}): SectorMacroSnapshot {
  const { sector, industry, marketSnapshot } = params;
  const matched = resolveSpdrSector(sector, industry);

  if (!matched) {
    return {
      companySector: sector,
      companyIndustry: industry,
      matchedSector: null,
      etfSymbol: null,
      etfName: null,
      changePercent: null,
      relativeVolume: null,
      flowSignal: "neutral",
      sectorRank: null,
      sectorsTotal: marketSnapshot.sectors.length,
      cyclical: null,
      headline: "Sector macro unavailable",
      summary:
        sector || industry
          ? `Could not map "${sector ?? industry}" to a standard S&P sector ETF proxy. Macro flow context is limited for this name.`
          : "Sector classification is unavailable for this symbol.",
      rotationNote: buildRotationNote(marketSnapshot.sectors),
      disclaimer: SECTOR_MACRO_DISCLAIMER,
      fetchedAt: marketSnapshot.fetchedAt,
    };
  }

  const performance = marketSnapshot.sectors.find(
    (s) => s.symbol === matched.symbol,
  );
  const rank = sectorRank(marketSnapshot.sectors, matched.sector);
  const flowSignal = performance?.flowSignal ?? "neutral";

  return {
    companySector: sector,
    companyIndustry: industry,
    matchedSector: matched.sector,
    etfSymbol: matched.symbol,
    etfName: matched.name,
    changePercent: performance?.changePercent ?? null,
    relativeVolume: performance?.relativeVolume ?? null,
    flowSignal,
    sectorRank: rank,
    sectorsTotal: marketSnapshot.sectors.length,
    cyclical: matched.cyclical,
    headline: flowHeadline(flowSignal, matched.sector),
    summary: flowSummary({
      etfSymbol: matched.symbol,
      etfName: matched.name,
      sector: matched.sector,
      changePercent: performance?.changePercent ?? null,
      relativeVolume: performance?.relativeVolume ?? null,
      flowSignal,
      sectorRank: rank,
      sectorsTotal: marketSnapshot.sectors.length,
    }),
    rotationNote: buildRotationNote(marketSnapshot.sectors),
    disclaimer: SECTOR_MACRO_DISCLAIMER,
    fetchedAt: marketSnapshot.fetchedAt,
  };
}

export { SECTOR_ETF_DEFS };
