import { yahooFinance } from "@/lib/yahoo";
import { ANALYSIS_CACHE_TTL_MS, getCached, setCached } from "@/lib/cache";
import type { FinancialsSnapshot } from "@/lib/types";

export type CategoryMetadata = {
  sector: string | null;
  industry: string | null;
  companyName: string | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function companyNameFromQuote(quote: unknown): string | null {
  if (!quote || typeof quote !== "object") return null;
  const record = quote as { shortName?: string; longName?: string };
  return record.shortName ?? record.longName ?? null;
}

export async function fetchFinancials(
  symbol: string,
): Promise<FinancialsSnapshot> {
  const normalized = symbol.trim().toUpperCase();
  const cacheKey = `financials:${normalized}`;
  const cached = getCached<FinancialsSnapshot>(cacheKey);
  if (cached) return cached;

  const summary = await yahooFinance.quoteSummary(normalized, {
    modules: [
      "financialData",
      "defaultKeyStatistics",
      "summaryDetail",
      "summaryProfile",
      "recommendationTrend",
      "price",
    ],
  });

  const financialData = summary.financialData;
  const keyStats = summary.defaultKeyStatistics;
  const summaryDetail = summary.summaryDetail;
  const profile = summary.summaryProfile;
  const recommendationTrend = summary.recommendationTrend?.trend?.[0];

  const snapshot: FinancialsSnapshot = {
    symbol: normalized,
    companyName: String(
      summary.price?.shortName ??
        summary.price?.longName ??
        profile?.longName ??
        normalized,
    ),
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    marketCap: num(summaryDetail?.marketCap),
    trailingPE: num(summaryDetail?.trailingPE ?? keyStats?.trailingPE),
    forwardPE: num(keyStats?.forwardPE),
    pegRatio: num(keyStats?.pegRatio),
    priceToBook: num(keyStats?.priceToBook),
    eps: num(keyStats?.trailingEps),
    revenueGrowth: num(financialData?.revenueGrowth),
    profitMargins: num(financialData?.profitMargins),
    operatingMargins: num(financialData?.operatingMargins),
    returnOnEquity: num(financialData?.returnOnEquity),
    returnOnAssets: num(financialData?.returnOnAssets),
    debtToEquity: num(financialData?.debtToEquity),
    currentRatio: num(financialData?.currentRatio),
    beta: num(summaryDetail?.beta),
    fiftyTwoWeekHigh: num(summaryDetail?.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(summaryDetail?.fiftyTwoWeekLow),
    targetMeanPrice: num(financialData?.targetMeanPrice),
    recommendationMean: num(financialData?.recommendationMean),
    analystStrongBuy: num(recommendationTrend?.strongBuy),
    analystBuy: num(recommendationTrend?.buy),
    analystHold: num(recommendationTrend?.hold),
    analystSell: num(recommendationTrend?.sell),
    analystStrongSell: num(recommendationTrend?.strongSell),
    fetchedAt: new Date().toISOString(),
  };

  setCached(cacheKey, snapshot, ANALYSIS_CACHE_TTL_MS);
  return snapshot;
}

export async function fetchCategoryMetadata(
  symbol: string,
): Promise<CategoryMetadata> {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) {
    return { sector: null, industry: null, companyName: null };
  }

  try {
    const financials = await fetchFinancials(normalized);
    return {
      sector: financials.sector,
      industry: financials.industry,
      companyName: financials.companyName,
    };
  } catch {
    try {
      const quote = await yahooFinance.quote(normalized);
      return {
        sector: null,
        industry: null,
        companyName: companyNameFromQuote(quote),
      };
    } catch {
      return { sector: null, industry: null, companyName: null };
    }
  }
}
