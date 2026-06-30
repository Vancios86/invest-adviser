import type { FinancialsSnapshot } from "@/lib/types";

function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)} trillion`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)} billion`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)} million`;
  return `$${cap.toLocaleString()}`;
}

function firstSentences(text: string, maxSentences = 2): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const matches = trimmed.match(/[^.!?]+[.!?]+/g);
  if (!matches || matches.length === 0) {
    return trimmed.length > 320 ? `${trimmed.slice(0, 317)}…` : trimmed;
  }
  const selected = matches.slice(0, maxSentences).join(" ").trim();
  return selected.length > 420 ? `${selected.slice(0, 417)}…` : selected;
}

function buildIdentitySentence(financials: FinancialsSnapshot): string {
  const { companyName, sector, industry, marketCap, symbol } = financials;
  let sentence = companyName;

  if (industry && sector) {
    sentence += ` operates in ${industry.toLowerCase()} within the ${sector} sector`;
  } else if (sector) {
    sentence += ` is listed in the ${sector} sector`;
  } else {
    sentence += ` (${symbol}) is a publicly traded company`;
  }

  if (marketCap !== null) {
    sentence += ` and carries a market capitalization of roughly ${formatMarketCap(marketCap)}`;
  }

  return `${sentence}.`;
}

function buildFundamentalsSentence(financials: FinancialsSnapshot): string | null {
  const highlights: string[] = [];

  if (financials.trailingPE !== null) {
    highlights.push(`trailing P/E of ${financials.trailingPE.toFixed(1)}`);
  }
  if (financials.revenueGrowth !== null) {
    highlights.push(
      `${(financials.revenueGrowth * 100).toFixed(0)}% year-over-year revenue growth`,
    );
  }
  if (financials.profitMargins !== null) {
    highlights.push(
      `${(financials.profitMargins * 100).toFixed(1)}% profit margins`,
    );
  }
  if (financials.returnOnEquity !== null) {
    highlights.push(
      `${(financials.returnOnEquity * 100).toFixed(1)}% return on equity`,
    );
  }

  if (highlights.length === 0) return null;
  return `Recent fundamentals include ${highlights.slice(0, 3).join(", ")}.`;
}

export function buildCompanyIntro(financials: FinancialsSnapshot): string {
  const parts: string[] = [];

  if (financials.longBusinessSummary) {
    parts.push(firstSentences(financials.longBusinessSummary));
  } else {
    parts.push(buildIdentitySentence(financials));
  }

  const fundamentals = buildFundamentalsSentence(financials);
  if (fundamentals) parts.push(fundamentals);

  return parts.join(" ");
}
