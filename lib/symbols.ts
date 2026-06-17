import { yahooFinance } from "@/lib/yahoo";
import type { AssetType } from "@/lib/types";

export const SYMBOL_PATTERN = /^[A-Z0-9.\-^]{1,12}$/;

type YahooQuoteResult = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  quoteType?: string;
  regularMarketPrice?: number;
  postMarketPrice?: number;
  preMarketPrice?: number;
};

type SearchQuote = {
  symbol?: string;
  quoteType?: string;
  exchange?: string;
  shortname?: string;
  longname?: string;
};

export type ResolvedSymbol = {
  symbol: string;
  quoteSymbol: string;
  assetType: AssetType;
  companyName: string | null;
  currency: string | null;
};

export function isValidSymbolFormat(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol.trim().toUpperCase());
}

function extractPrice(quote: YahooQuoteResult): number | null {
  const price =
    quote.regularMarketPrice ??
    quote.postMarketPrice ??
    quote.preMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  return price;
}

function inferAssetType(
  quote: YahooQuoteResult,
  preference: AssetType,
): AssetType {
  if (preference !== "stock") return preference;

  const name = `${quote.longName ?? ""} ${quote.shortName ?? ""}`.toLowerCase();
  if (quote.quoteType === "ETF") {
    if (
      /gold|silver|platinum|commodity|physical|xetra|precious metal/.test(name)
    ) {
      return "commodity";
    }
    return "etf";
  }

  if (
    /etc|exchange traded commodity|physical markets|certificate|etp/.test(name)
  ) {
    return "etc";
  }

  return "stock";
}

function scoreSearchCandidate(
  input: string,
  candidate: SearchQuote,
  assetType: AssetType,
): number {
  const symbol = candidate.symbol?.toUpperCase() ?? "";
  if (!symbol) return 0;

  let score = 0;

  if (symbol === input) score += 100;
  else if (symbol.startsWith(`${input}.`)) score += 90;
  else if (symbol.replace(/\./g, "").startsWith(input)) score += 70;
  else if (symbol.includes(input)) score += 35;

  if (candidate.quoteType === "ETF" || candidate.quoteType === "EQUITY") {
    score += 15;
  }

  if (assetType === "commodity" || assetType === "etc") {
    if (/\.(DE|F|L|PA|SW|AS)$/.test(symbol)) score += 25;
    if (candidate.quoteType === "ETF") score += 20;
  } else if (!symbol.includes(".")) {
    score += 15;
  }

  if (candidate.exchange === "NMS" || candidate.exchange === "NYQ") {
    score += 10;
  }

  return score;
}

async function fetchQuote(symbol: string): Promise<YahooQuoteResult | null> {
  try {
    const quote = (await yahooFinance.quote(symbol)) as YahooQuoteResult;
    if (!quote?.symbol || extractPrice(quote) === null) return null;
    return quote;
  } catch {
    return null;
  }
}

export async function resolveQuoteSymbol(
  input: string,
  assetType: AssetType = "stock",
): Promise<ResolvedSymbol | null> {
  const normalized = input.trim().toUpperCase();
  if (!isValidSymbolFormat(normalized)) return null;

  const direct = await fetchQuote(normalized);
  if (direct?.symbol) {
    return {
      symbol: normalized.includes(".")
        ? normalized.split(".")[0]!
        : normalized,
      quoteSymbol: direct.symbol.toUpperCase(),
      assetType: inferAssetType(direct, assetType),
      companyName: direct.shortName ?? direct.longName ?? null,
      currency: direct.currency ?? null,
    };
  }

  const search = await yahooFinance.search(normalized, { quotesCount: 15 });
  const candidates = (search.quotes ?? [])
    .filter((quote) => typeof quote?.symbol === "string")
    .map((quote) => ({
      quote: quote as SearchQuote,
      score: scoreSearchCandidate(normalized, quote as SearchQuote, assetType),
    }))
    .filter(({ score }) => score >= 50)
    .sort((a, b) => b.score - a.score);

  for (const { quote } of candidates) {
    const resolved = await fetchQuote(quote.symbol!);
    if (!resolved?.symbol) continue;

    return {
      symbol: normalized,
      quoteSymbol: resolved.symbol.toUpperCase(),
      assetType: inferAssetType(resolved, assetType),
      companyName: resolved.shortName ?? resolved.longName ?? null,
      currency: resolved.currency ?? null,
    };
  }

  return null;
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "Stock",
  commodity: "Commodity",
  etc: "ETC",
  etf: "ETF",
};

export function parseAssetType(value: unknown): AssetType {
  const normalized = String(value ?? "stock").toLowerCase();
  if (
    normalized === "stock" ||
    normalized === "commodity" ||
    normalized === "etc" ||
    normalized === "etf"
  ) {
    return normalized;
  }
  return "stock";
}
