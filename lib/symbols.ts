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

export function looksLikeTicker(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;

  const upper = trimmed.toUpperCase();
  if (!isValidSymbolFormat(upper)) return false;

  // Exchange suffixes: 4GLD.DE, BRK.B
  if (/\.[A-Z0-9]{1,4}$/.test(upper)) return true;

  // Symbols with digits are usually tickers (4GLD, 8PSB)
  if (/\d/.test(trimmed)) return true;

  // Lowercase letters → company name (Apple, Nvidia, microsoft)
  if (/[a-z]/.test(trimmed)) return false;

  // All-caps short symbols are standard tickers (AAPL, NVDA)
  if (trimmed === upper && upper.length <= 5) return true;

  // Longer all-caps token — try ticker first, fall back to name search
  return trimmed === upper;
}

function canonicalSymbolFromQuoteSymbol(quoteSymbol: string): string {
  const normalized = quoteSymbol.trim().toUpperCase();
  return normalized.includes(".") ? normalized.split(".")[0]! : normalized;
}

function resolvedFromQuote(
  quote: YahooQuoteResult,
  assetType: AssetType,
): ResolvedSymbol | null {
  if (!quote.symbol) return null;
  const quoteSymbol = quote.symbol.toUpperCase();
  return {
    symbol: canonicalSymbolFromQuoteSymbol(quoteSymbol),
    quoteSymbol,
    assetType: inferAssetType(quote, assetType),
    companyName: quote.shortName ?? quote.longName ?? null,
    currency: quote.currency ?? null,
  };
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

function firstToken(text: string): string {
  return text.toLowerCase().split(/[\s,.-]+/)[0] ?? "";
}

function scoreNameSearchCandidate(
  query: string,
  candidate: SearchQuote,
  assetType: AssetType,
): number {
  const q = query.toLowerCase().trim();
  const shortName = (candidate.shortname ?? "").toLowerCase();
  const longName = (candidate.longname ?? "").toLowerCase();
  const symbol = candidate.symbol?.toUpperCase() ?? "";
  if (!q || !symbol) return 0;

  let score = 0;

  if (longName === q || shortName === q) score += 120;
  else if (longName.startsWith(q) || shortName.startsWith(q)) score += 95;
  else if (longName.includes(q) || shortName.includes(q)) score += 75;

  const queryToken = firstToken(q);
  const longToken = firstToken(longName);
  const shortToken = firstToken(shortName);
  if (queryToken.length > 1) {
    if (queryToken === longToken || queryToken === shortToken) score += 100;
    else if (longToken.startsWith(queryToken) || shortToken.startsWith(queryToken)) {
      score += 85;
    }
  }

  const words = q.split(/\s+/).filter((word) => word.length > 1);
  if (words.length > 1) {
    const haystack = `${longName} ${shortName}`;
    score += words.filter((word) => haystack.includes(word)).length * 25;
  }

  if (assetType === "stock") {
    if (candidate.quoteType === "EQUITY") score += 20;
    else if (candidate.quoteType === "ETF") score -= 30;
  } else if (assetType === "etf") {
    if (candidate.quoteType === "ETF") score += 25;
  } else if (assetType === "commodity" || assetType === "etc") {
    if (candidate.quoteType === "ETF") score += 15;
    if (/\.(DE|F|L|PA|SW|AS|MI|IR)$/.test(symbol)) score += 20;
  }

  if (candidate.exchange === "NMS" || candidate.exchange === "NYQ") {
    score += 5;
  }

  return score;
}

async function resolveCompanyName(
  query: string,
  assetType: AssetType,
): Promise<ResolvedSymbol | null> {
  try {
    const search = await yahooFinance.search(query, { quotesCount: 15 });
    const candidates = (search.quotes ?? [])
      .filter((quote) => typeof quote?.symbol === "string")
      .map((quote) => ({
        quote: quote as SearchQuote,
        score: scoreNameSearchCandidate(query, quote as SearchQuote, assetType),
      }))
      .filter(({ score }) => score >= 40)
      .sort((a, b) => b.score - a.score);

    for (const { quote } of candidates.slice(0, 6)) {
      const resolved = await fetchQuote(quote.symbol!);
      if (!resolved) continue;
      const mapped = resolvedFromQuote(resolved, assetType);
      if (mapped) return mapped;
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolveSymbolOrCompanyName(
  input: string,
  assetType: AssetType = "stock",
): Promise<ResolvedSymbol | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (looksLikeTicker(trimmed)) {
    const asTicker = await resolveQuoteSymbol(trimmed.toUpperCase(), assetType);
    if (asTicker) return asTicker;
  }

  return resolveCompanyName(trimmed, assetType);
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

function looksLikeUcitsListing(candidate: SearchQuote): boolean {
  const name = `${candidate.longname ?? ""} ${candidate.shortname ?? ""}`.toLowerCase();
  if (!name.includes("ucits")) return false;
  const symbol = candidate.symbol?.toUpperCase() ?? "";
  if (!symbol) return false;
  return /\.(DE|F|L|PA|SW|AS|MI|IR)$/.test(symbol);
}

function scoreUcitsCandidate(inputSymbol: string, candidate: SearchQuote): number {
  const symbol = candidate.symbol?.toUpperCase() ?? "";
  const name = `${candidate.longname ?? ""} ${candidate.shortname ?? ""}`.toLowerCase();
  let score = 0;

  if (symbol.startsWith(`${inputSymbol}.`)) score += 100;
  else if (symbol.includes(inputSymbol)) score += 50;

  if (name.includes("vaneck")) score += 25;
  if (name.includes("gold") && name.includes("miner")) score += 25;
  if (name.includes("ucits")) score += 50;

  if (/\.(DE|MI|PA|AS|SW|L)$/.test(symbol)) score += 10;
  if (candidate.exchange === "GER") score += 15;

  return score;
}

export async function resolveQuoteSymbol(
  input: string,
  assetType: AssetType = "stock",
): Promise<ResolvedSymbol | null> {
  const normalized = input.trim().toUpperCase();
  if (!isValidSymbolFormat(normalized)) return null;

  const direct = await fetchQuote(normalized);
  if (direct?.symbol) {
    if (assetType === "etf" && !normalized.includes(".")) {
      try {
        const baseName = `${direct.longName ?? direct.shortName ?? ""}`
          .replace(/\bETF\b/gi, "")
          .replace(/\bETFS\b/gi, "")
          .replace(/\bFUND\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();

        const searchQueries = [
          normalized,
          `${baseName || normalized} UCITS`,
          `${baseName || normalized} UCITS ETF`,
          `${normalized} UCITS`,
        ];

        const allCandidates: { quote: SearchQuote; score: number }[] = [];

        for (const query of searchQueries) {
          const search = await yahooFinance.search(query, { quotesCount: 15 });
          const ucitsCandidates = (search.quotes ?? [])
            .filter((quote) => typeof quote?.symbol === "string")
            .map((quote) => quote as SearchQuote)
            .filter((quote) => looksLikeUcitsListing(quote))
            .map((quote) => ({
              quote,
              score: scoreUcitsCandidate(normalized, quote),
            }));

          allCandidates.push(...ucitsCandidates);
        }

        const ranked = allCandidates
          .sort((a, b) => b.score - a.score)
          .map((entry) => entry.quote)
          .filter((quote): quote is SearchQuote & { symbol: string } =>
            typeof quote.symbol === "string" && quote.symbol.length > 0,
          );

        const seen = new Set<string>();
        const uniqueSymbols = ranked
          .map((q) => q.symbol!.toUpperCase())
          .filter((sym) => (seen.has(sym) ? false : (seen.add(sym), true)))
          .slice(0, 10);

        let bestResolved: { quote: YahooQuoteResult; score: number } | null = null;
        for (const sym of uniqueSymbols) {
          const resolved = await fetchQuote(sym);
          if (!resolved?.symbol) continue;

          const base =
            allCandidates.find(
              (c) => c.quote.symbol?.toUpperCase() === sym.toUpperCase(),
            )?.score ?? 0;

          const currencyBonus =
            resolved.currency === "EUR" ? 40 : resolved.currency === "USD" ? -10 : 0;

          const totalScore = base + currencyBonus;
          if (!bestResolved || totalScore > bestResolved.score) {
            bestResolved = { quote: resolved, score: totalScore };
          }
        }

        if (bestResolved) {
          const resolved = bestResolved.quote;
          return {
            symbol: normalized,
            quoteSymbol: resolved.symbol!.toUpperCase(),
            assetType: inferAssetType(resolved, assetType),
            companyName: resolved.shortName ?? resolved.longName ?? null,
            currency: resolved.currency ?? null,
          };
        }
      } catch {
        // ignore search failures and fall back to the direct quote
      }
    }

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
