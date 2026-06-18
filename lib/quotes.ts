import { yahooFinance } from "@/lib/yahoo";
import { resolveQuoteSymbol } from "@/lib/symbols";
import type { AssetType, Quote, QuotesMap } from "@/lib/types";

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  data: QuotesMap;
  expiresAt: number;
};

type YahooQuoteResult = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice?: number;
  postMarketPrice?: number;
  preMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  averageDailyVolume10Day?: number;
  marketState?: string;
};

type FinnhubQuoteResponse = {
  c: number;
  d: number;
  dp: number;
  pc: number;
  t: number;
};

const cache = new Map<string, CacheEntry>();

export class QuoteFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteFetchError";
  }
}

function cacheKey(symbols: string[]): string {
  return symbols.slice().sort().join(",");
}

function parseYahooQuote(quote: YahooQuoteResult): Quote | null {
  if (!quote.symbol) return null;

  const price =
    quote.regularMarketPrice ??
    quote.postMarketPrice ??
    quote.preMarketPrice;

  if (typeof price !== "number" || Number.isNaN(price)) return null;

  const volume =
    typeof quote.regularMarketVolume === "number" &&
    Number.isFinite(quote.regularMarketVolume) &&
    quote.regularMarketVolume >= 0
      ? quote.regularMarketVolume
      : null;

  const averageVolume =
    typeof quote.averageDailyVolume3Month === "number" &&
    Number.isFinite(quote.averageDailyVolume3Month) &&
    quote.averageDailyVolume3Month > 0
      ? quote.averageDailyVolume3Month
      : typeof quote.averageDailyVolume10Day === "number" &&
          Number.isFinite(quote.averageDailyVolume10Day) &&
          quote.averageDailyVolume10Day > 0
        ? quote.averageDailyVolume10Day
        : null;

  return {
    price,
    currency: quote.currency ?? "USD",
    fetchedAt: new Date().toISOString(),
    companyName: quote.shortName ?? quote.longName ?? null,
    changePercent: quote.regularMarketChangePercent ?? null,
    previousClose: quote.regularMarketPreviousClose ?? null,
    volume,
    averageVolume,
    marketState: quote.marketState ?? null,
    source: "yahoo",
  };
}

function ingestYahooQuotes(
  quotes: YahooQuoteResult | YahooQuoteResult[],
  result: QuotesMap,
): void {
  const quoteList = Array.isArray(quotes) ? quotes : [quotes];

  for (const quote of quoteList) {
    const parsed = parseYahooQuote(quote);
    if (parsed) {
      result[quote.symbol!.toUpperCase()] = parsed;
    }
  }
}

async function fetchFromYahoo(symbols: string[]): Promise<QuotesMap> {
  const result: QuotesMap = {};

  try {
    const quotes = await yahooFinance.quote(symbols);
    ingestYahooQuotes(quotes as YahooQuoteResult | YahooQuoteResult[], result);
  } catch (error) {
    console.error("Batch Yahoo Finance quote fetch failed:", error);
  }

  const missing = symbols.filter((symbol) => !result[symbol]);
  if (missing.length === 0) {
    return result;
  }

  await Promise.all(
    missing.map(async (symbol) => {
      try {
        const quote = await yahooFinance.quote(symbol);
        ingestYahooQuotes(quote as YahooQuoteResult, result);
      } catch (error) {
        console.error(`Failed to fetch Yahoo quote for ${symbol}:`, error);
      }
    }),
  );

  return result;
}

async function fetchCompanyNamesFromYahoo(
  symbols: string[],
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  if (symbols.length === 0) return names;

  try {
    const quotes = await yahooFinance.quote(symbols);
    const quoteList = Array.isArray(quotes) ? quotes : [quotes];

    for (const quote of quoteList as YahooQuoteResult[]) {
      const companyName = quote.shortName ?? quote.longName;
      if (quote.symbol && companyName) {
        names[quote.symbol.toUpperCase()] = companyName;
      }
    }
  } catch (error) {
    console.error("Batch Yahoo Finance company name fetch failed:", error);
  }

  const missing = symbols.filter((symbol) => !names[symbol]);
  await Promise.all(
    missing.map(async (symbol) => {
      try {
        const quote = (await yahooFinance.quote(symbol)) as YahooQuoteResult;
        const companyName = quote.shortName ?? quote.longName;
        if (companyName) {
          names[symbol] = companyName;
        }
      } catch (error) {
        console.error(`Failed to fetch company name for ${symbol}:`, error);
      }
    }),
  );

  return names;
}

async function fetchFromFinnhub(symbols: string[]): Promise<QuotesMap> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return {};
  }

  const result: QuotesMap = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const url = new URL("https://finnhub.io/api/v1/quote");
        url.searchParams.set("symbol", symbol);
        url.searchParams.set("token", apiKey);

        const response = await fetch(url, {
          next: { revalidate: 0 },
        });

        if (!response.ok) {
          console.error(`Finnhub quote failed for ${symbol}: ${response.status}`);
          return;
        }

        const data = (await response.json()) as FinnhubQuoteResponse;
        if (typeof data.c !== "number" || data.c <= 0) {
          return;
        }

        result[symbol] = {
          price: data.c,
          currency: "USD",
          fetchedAt: new Date(data.t * 1000).toISOString(),
          changePercent: typeof data.dp === "number" ? data.dp : null,
          previousClose: typeof data.pc === "number" ? data.pc : null,
          volume: null,
          averageVolume: null,
          marketState: null,
          source: "finnhub",
        };
      } catch (error) {
        console.error(`Failed to fetch Finnhub quote for ${symbol}:`, error);
      }
    }),
  );

  return result;
}

export async function fetchQuotes(symbols: string[]): Promise<QuotesMap> {
  const normalized = [
    ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];

  if (normalized.length === 0) {
    return {};
  }

  const key = cacheKey(normalized);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const finnhubQuotes = await fetchFromFinnhub(normalized);
  const missingAfterFinnhub = normalized.filter((symbol) => !finnhubQuotes[symbol]);
  const yahooQuotes =
    missingAfterFinnhub.length > 0
      ? await fetchFromYahoo(missingAfterFinnhub)
      : {};

  const result: QuotesMap = { ...finnhubQuotes, ...yahooQuotes };

  const symbolsMissingNames = normalized.filter(
    (symbol) => result[symbol] && !result[symbol].companyName,
  );
  if (symbolsMissingNames.length > 0) {
    const names = await fetchCompanyNamesFromYahoo(symbolsMissingNames);
    for (const [symbol, companyName] of Object.entries(names)) {
      if (result[symbol]) {
        result[symbol].companyName = companyName;
      }
    }
  }

  if (Object.keys(result).length === 0) {
    throw new QuoteFetchError(
      "Unable to fetch live market prices. Check your connection and try again.",
    );
  }

  cache.set(key, {
    data: result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return result;
}

export async function validateSymbol(
  symbol: string,
  assetType: AssetType = "stock",
): Promise<boolean> {
  const resolved = await resolveQuoteSymbol(symbol, assetType);
  return resolved !== null;
}

export async function resolveSymbolForHolding(
  symbol: string,
  assetType: AssetType,
) {
  return resolveQuoteSymbol(symbol, assetType);
}

export type { Quote, QuotesMap };
