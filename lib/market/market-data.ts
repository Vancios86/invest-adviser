import { yahooFinance } from "@/lib/yahoo";
import { ANALYSIS_CACHE_TTL_MS, getCached, setCached } from "@/lib/cache";
import { fetchMarketNews } from "@/lib/news";
import type {
  MarketBreadth,
  MarketInstrument,
  MarketSnapshot,
  SectorPerformance,
} from "@/lib/types";

type YahooMarketQuote = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
};

const INDEX_DEFS: { symbol: string; name: string }[] = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "Nasdaq Composite" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "^RUT", name: "Russell 2000" },
];

const VIX_DEF = { symbol: "^VIX", name: "Volatility Index (VIX)" };

const MACRO_DEFS: { symbol: string; name: string }[] = [
  { symbol: "^TNX", name: "US 10Y Treasury Yield" },
  { symbol: "DX-Y.NYB", name: "US Dollar Index" },
  { symbol: "GC=F", name: "Gold" },
  { symbol: "CL=F", name: "Crude Oil (WTI)" },
  { symbol: "BTC-USD", name: "Bitcoin" },
];

// SPDR sector ETFs are widely used proxies for sector performance and flows.
const SECTOR_DEFS: { symbol: string; sector: string; cyclical: boolean }[] = [
  { symbol: "XLK", sector: "Technology", cyclical: true },
  { symbol: "XLY", sector: "Consumer Discretionary", cyclical: true },
  { symbol: "XLF", sector: "Financials", cyclical: true },
  { symbol: "XLI", sector: "Industrials", cyclical: true },
  { symbol: "XLB", sector: "Materials", cyclical: true },
  { symbol: "XLE", sector: "Energy", cyclical: true },
  { symbol: "XLC", sector: "Communication Services", cyclical: true },
  { symbol: "XLRE", sector: "Real Estate", cyclical: false },
  { symbol: "XLV", sector: "Health Care", cyclical: false },
  { symbol: "XLP", sector: "Consumer Staples", cyclical: false },
  { symbol: "XLU", sector: "Utilities", cyclical: false },
];

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function flowSignalFor(
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

async function quoteMany(
  symbols: string[],
): Promise<Map<string, YahooMarketQuote>> {
  const map = new Map<string, YahooMarketQuote>();
  if (symbols.length === 0) return map;

  try {
    const quotes = (await yahooFinance.quote(symbols)) as
      | YahooMarketQuote
      | YahooMarketQuote[];
    const list = Array.isArray(quotes) ? quotes : [quotes];
    for (const quote of list) {
      if (quote?.symbol) {
        map.set(quote.symbol.toUpperCase(), quote);
      }
    }
  } catch (error) {
    console.error("Market quote batch failed:", error);
  }

  return map;
}

function toInstrument(
  def: { symbol: string; name: string },
  quote: YahooMarketQuote | undefined,
): MarketInstrument {
  return {
    symbol: def.symbol,
    name: def.name,
    price: num(quote?.regularMarketPrice),
    changePercent: num(quote?.regularMarketChangePercent),
  };
}

function computeBreadth(sectors: SectorPerformance[]): MarketBreadth {
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;

  for (const sector of sectors) {
    if (sector.changePercent === null) {
      unchanged += 1;
    } else if (sector.changePercent > 0.05) {
      advancers += 1;
    } else if (sector.changePercent < -0.05) {
      decliners += 1;
    } else {
      unchanged += 1;
    }
  }

  return {
    advancers,
    decliners,
    unchanged,
    advanceDeclineRatio: decliners > 0 ? advancers / decliners : null,
  };
}

export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const cacheKey = "market:snapshot";
  const cached = getCached<MarketSnapshot>(cacheKey);
  if (cached) return cached;

  const allSymbols = [
    ...INDEX_DEFS.map((d) => d.symbol),
    VIX_DEF.symbol,
    ...MACRO_DEFS.map((d) => d.symbol),
    ...SECTOR_DEFS.map((d) => d.symbol),
  ];

  const [quotes, news] = await Promise.all([
    quoteMany(allSymbols),
    fetchMarketNews(),
  ]);

  const indices = INDEX_DEFS.map((def) =>
    toInstrument(def, quotes.get(def.symbol.toUpperCase())),
  );

  const vixQuote = quotes.get(VIX_DEF.symbol.toUpperCase());
  const volatility = vixQuote ? toInstrument(VIX_DEF, vixQuote) : null;

  const macro = MACRO_DEFS.map((def) =>
    toInstrument(def, quotes.get(def.symbol.toUpperCase())),
  );

  const sectors: SectorPerformance[] = SECTOR_DEFS.map((def) => {
    const quote = quotes.get(def.symbol.toUpperCase());
    const changePercent = num(quote?.regularMarketChangePercent);
    const volume = num(quote?.regularMarketVolume);
    const avgVolume = num(quote?.averageDailyVolume3Month);
    const relativeVolume =
      volume !== null && avgVolume !== null && avgVolume > 0
        ? volume / avgVolume
        : null;

    return {
      symbol: def.symbol,
      sector: def.sector,
      changePercent,
      relativeVolume,
      flowSignal: flowSignalFor(changePercent, relativeVolume),
    };
  });

  const snapshot: MarketSnapshot = {
    indices,
    volatility,
    macro,
    sectors,
    breadth: computeBreadth(sectors),
    news,
    fetchedAt: new Date().toISOString(),
  };

  setCached(cacheKey, snapshot, ANALYSIS_CACHE_TTL_MS);
  return snapshot;
}

export { SECTOR_DEFS };
