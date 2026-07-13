import type { SectorPerformance } from "@/lib/types";

export type SectorEtfDef = {
  symbol: string;
  sector: string;
  name: string;
  cyclical: boolean;
};

// SPDR sector ETFs are widely used proxies for sector performance and flows.
export const SECTOR_ETF_DEFS: SectorEtfDef[] = [
  { symbol: "XLK", sector: "Technology", name: "Technology Select Sector SPDR", cyclical: true },
  { symbol: "XLY", sector: "Consumer Discretionary", name: "Consumer Discretionary Select Sector SPDR", cyclical: true },
  { symbol: "XLF", sector: "Financials", name: "Financial Select Sector SPDR", cyclical: true },
  { symbol: "XLI", sector: "Industrials", name: "Industrial Select Sector SPDR", cyclical: true },
  { symbol: "XLB", sector: "Materials", name: "Materials Select Sector SPDR", cyclical: true },
  { symbol: "XLE", sector: "Energy", name: "Energy Select Sector SPDR", cyclical: true },
  { symbol: "XLC", sector: "Communication Services", name: "Communication Services Select Sector SPDR", cyclical: true },
  { symbol: "XLRE", sector: "Real Estate", name: "Real Estate Select Sector SPDR", cyclical: false },
  { symbol: "XLV", sector: "Health Care", name: "Health Care Select Sector SPDR", cyclical: false },
  { symbol: "XLP", sector: "Consumer Staples", name: "Consumer Staples Select Sector SPDR", cyclical: false },
  { symbol: "XLU", sector: "Utilities", name: "Utilities Select Sector SPDR", cyclical: false },
];

const SECTOR_ALIASES: Record<string, string> = {
  technology: "Technology",
  "financial services": "Financials",
  financials: "Financials",
  financial: "Financials",
  healthcare: "Health Care",
  "health care": "Health Care",
  "consumer cyclical": "Consumer Discretionary",
  "consumer discretionary": "Consumer Discretionary",
  "consumer defensive": "Consumer Staples",
  "consumer staples": "Consumer Staples",
  "basic materials": "Materials",
  materials: "Materials",
  "communication services": "Communication Services",
  "real estate": "Real Estate",
  energy: "Energy",
  industrials: "Industrials",
  utilities: "Utilities",
};

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function flowSignalFor(
  changePercent: number | null,
  relativeVolume: number | null,
): SectorPerformance["flowSignal"] {
  if (changePercent === null || relativeVolume === null) return "neutral";
  // Elevated participation confirms the day's direction (a flow proxy).
  if (relativeVolume >= 1.15) {
    if (changePercent > 0.25) return "accumulation";
    if (changePercent < -0.25) return "distribution";
  }
  return "neutral";
}

export function resolveSpdrSector(
  sector: string | null,
  industry: string | null,
): SectorEtfDef | null {
  const sectorKey = sector?.trim().toLowerCase() ?? "";
  const industryKey = industry?.trim().toLowerCase() ?? "";

  if (sectorKey) {
    const alias = SECTOR_ALIASES[sectorKey];
    if (alias) {
      const match = SECTOR_ETF_DEFS.find((def) => def.sector === alias);
      if (match) return match;
    }

    const direct = SECTOR_ETF_DEFS.find(
      (def) => def.sector.toLowerCase() === sectorKey,
    );
    if (direct) return direct;

    for (const def of SECTOR_ETF_DEFS) {
      const defKey = def.sector.toLowerCase();
      if (sectorKey.includes(defKey) || defKey.includes(sectorKey)) {
        return def;
      }
    }
  }

  if (!industryKey) return null;

  if (
    includesAny(industryKey, [
      "software",
      "semiconductor",
      "internet content",
      "information technology",
      "electronic",
      "computer",
    ])
  ) {
    return SECTOR_ETF_DEFS.find((def) => def.sector === "Technology") ?? null;
  }

  if (
    includesAny(industryKey, [
      "biotechnology",
      "pharmaceutical",
      "drug",
      "medical",
      "health",
    ])
  ) {
    return SECTOR_ETF_DEFS.find((def) => def.sector === "Health Care") ?? null;
  }

  if (
    includesAny(industryKey, [
      "banks",
      "insurance",
      "asset management",
      "capital markets",
      "financial",
    ])
  ) {
    return SECTOR_ETF_DEFS.find((def) => def.sector === "Financials") ?? null;
  }

  if (includesAny(industryKey, ["reit", "real estate"])) {
    return SECTOR_ETF_DEFS.find((def) => def.sector === "Real Estate") ?? null;
  }

  if (includesAny(industryKey, ["oil", "gas", "refining", "exploration"])) {
    return SECTOR_ETF_DEFS.find((def) => def.sector === "Energy") ?? null;
  }

  if (
    includesAny(industryKey, [
      "retail",
      "restaurants",
      "apparel",
      "automobile",
      "leisure",
      "hotels",
    ])
  ) {
    return SECTOR_ETF_DEFS.find(
      (def) => def.sector === "Consumer Discretionary",
    ) ?? null;
  }

  if (
    includesAny(industryKey, [
      "food",
      "beverage",
      "household",
      "personal products",
      "tobacco",
    ])
  ) {
    return SECTOR_ETF_DEFS.find((def) => def.sector === "Consumer Staples") ?? null;
  }

  if (
    includesAny(industryKey, [
      "telecom",
      "wireless",
      "broadcasting",
      "entertainment",
      "media",
      "advertising",
    ])
  ) {
    return SECTOR_ETF_DEFS.find(
      (def) => def.sector === "Communication Services",
    ) ?? null;
  }

  if (
    includesAny(industryKey, [
      "mining",
      "metals",
      "chemical",
      "steel",
      "paper",
      "packaging",
    ])
  ) {
    return SECTOR_ETF_DEFS.find((def) => def.sector === "Materials") ?? null;
  }

  if (
    includesAny(industryKey, [
      "airlines",
      "railroads",
      "trucking",
      "logistics",
      "shipping",
      "aerospace",
      "defense",
      "machinery",
      "construction",
    ])
  ) {
    return SECTOR_ETF_DEFS.find((def) => def.sector === "Industrials") ?? null;
  }

  if (includesAny(industryKey, ["utilities", "electric", "water", "gas utilities"])) {
    return SECTOR_ETF_DEFS.find((def) => def.sector === "Utilities") ?? null;
  }

  return null;
}

export function sectorRank(
  sectors: SectorPerformance[],
  matchedSector: string,
): number | null {
  const ranked = [...sectors]
    .filter((s) => s.changePercent !== null)
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));

  const index = ranked.findIndex((s) => s.sector === matchedSector);
  return index >= 0 ? index + 1 : null;
}

function averageChange(
  sectors: SectorPerformance[],
  cyclical: boolean,
): number | null {
  const symbols = new Set(
    SECTOR_ETF_DEFS.filter((def) => def.cyclical === cyclical).map(
      (def) => def.symbol,
    ),
  );
  const values = sectors
    .filter((s) => symbols.has(s.symbol) && s.changePercent !== null)
    .map((s) => s.changePercent as number);

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildRotationNote(sectors: SectorPerformance[]): string | null {
  const cyclicalAvg = averageChange(sectors, true);
  const defensiveAvg = averageChange(sectors, false);

  if (cyclicalAvg === null || defensiveAvg === null) return null;

  const spread = cyclicalAvg - defensiveAvg;
  if (spread >= 0.35) {
    return "Cyclical sectors are outperforming defensives today — a risk-on rotation that can lift growth-oriented names.";
  }
  if (spread <= -0.35) {
    return "Defensive sectors are leading cyclicals today — institutions may be rotating toward safety.";
  }
  return "Sector rotation looks balanced — no strong cyclical vs. defensive tilt in today's tape.";
}
