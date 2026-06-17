import type { AssetType } from "@/lib/types";

export type IndustryCategory =
  | "Metals"
  | "Tech"
  | "Communication"
  | "Energy"
  | "Transportation"
  | "Financials"
  | "Healthcare"
  | "Consumer"
  | "Industrials"
  | "Utilities"
  | "Real Estate"
  | "Crypto"
  | "Cash"
  | "Other";

export const CATEGORY_COLORS: Record<IndustryCategory, string> = {
  Metals: "#f59e0b",
  Tech: "#3b82f6",
  Communication: "#06b6d4",
  Energy: "#ef4444",
  Transportation: "#14b8a6",
  Financials: "#a855f7",
  Healthcare: "#22c55e",
  Consumer: "#ec4899",
  Industrials: "#64748b",
  Utilities: "#84cc16",
  "Real Estate": "#0ea5e9",
  Crypto: "#f97316",
  Cash: "#94a3b8",
  Other: "#a1a1aa",
};

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function categorizeHolding(params: {
  assetType: AssetType | null | undefined;
  symbol: string;
  sector: string | null;
  industry: string | null;
  companyName: string | null;
}): IndustryCategory {
  const name = `${params.companyName ?? ""}`.toLowerCase();
  const sector = `${params.sector ?? ""}`.toLowerCase();
  const industry = `${params.industry ?? ""}`.toLowerCase();
  const symbol = params.symbol.toUpperCase();
  const symbolText = symbol.toLowerCase();

  if (symbol === "CASH" || symbol === "EUR" || symbol === "USD") return "Cash";

  // Some ETC/UCITS tickers do not expose meaningful sector/industry via Yahoo.
  // Keep a small override set for known precious-metals products.
  if (symbol === "8PSB") return "Metals";

  const metalKeywords = [
    "gold",
    "silver",
    "platinum",
    "palladium",
    "precious",
    "bullion",
    "metals",
    "mining",
    "miners",
  ];

  // Quick wins for non-equities
  if (params.assetType === "commodity" || params.assetType === "etc") {
    if (includesAny(sector, ["basic materials"])) {
      return "Metals";
    }

    if (includesAny(`${name} ${industry} ${sector} ${symbolText}`, metalKeywords)) {
      return "Metals";
    }
    return "Other";
  }

  // Crypto / blockchain proxies
  if (includesAny(name + " " + sector + " " + industry, ["crypto", "bitcoin", "blockchain"])) {
    return "Crypto";
  }

  // Metals/mining
  if (
    includesAny(sector, ["basic materials"]) ||
    includesAny(industry, metalKeywords) ||
    includesAny(name, metalKeywords)
  ) {
    return "Metals";
  }

  // Communication Services (GICS sector)
  if (
    includesAny(sector, ["communication services"]) ||
    includesAny(industry, [
      "internet content",
      "telecom",
      "wireless",
      "broadcasting",
      "entertainment",
      "media",
      "advertising",
      "publishing",
    ])
  ) {
    return "Communication";
  }

  // Tech
  if (includesAny(sector, ["technology"]) || includesAny(industry, ["software", "semiconductor"])) {
    return "Tech";
  }

  // Energy
  if (includesAny(sector, ["energy"]) || includesAny(industry, ["oil", "gas", "refining"])) {
    return "Energy";
  }

  // Transportation
  if (
    includesAny(sector, ["industrials"]) &&
    includesAny(industry, ["airlines", "railroads", "trucking", "logistics", "shipping"])
  ) {
    return "Transportation";
  }

  // Financials
  if (includesAny(sector, ["financial"]) || includesAny(industry, ["banks", "insurance", "asset management"])) {
    return "Financials";
  }

  // Healthcare
  if (includesAny(sector, ["healthcare"]) || includesAny(industry, ["biotechnology", "pharmaceutical"])) {
    return "Healthcare";
  }

  // Consumer
  if (includesAny(sector, ["consumer"]) || includesAny(industry, ["retail", "restaurants"])) {
    return "Consumer";
  }

  // Utilities
  if (includesAny(sector, ["utilities"])) return "Utilities";

  // Real estate
  if (includesAny(sector, ["real estate"]) || includesAny(industry, ["reit"])) return "Real Estate";

  // Industrials (catch-all)
  if (includesAny(sector, ["industrials"])) return "Industrials";

  return "Other";
}

