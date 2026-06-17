import { yahooFinance } from "@/lib/yahoo";
import { ANALYSIS_CACHE_TTL_MS, getCached, setCached } from "@/lib/cache";
import type { NewsItem, NewsSnapshot } from "@/lib/types";

const POSITIVE_WORDS = [
  "beat",
  "growth",
  "surge",
  "record",
  "upgrade",
  "profit",
  "strong",
  "bullish",
  "outperform",
  "raise",
];
const NEGATIVE_WORDS = [
  "miss",
  "fall",
  "drop",
  "decline",
  "cut",
  "loss",
  "weak",
  "bearish",
  "downgrade",
  "lawsuit",
  "investigation",
];

function scoreHeadline(title: string): "positive" | "negative" | "neutral" {
  const lower = title.toLowerCase();
  const positive = POSITIVE_WORDS.some((word) => lower.includes(word));
  const negative = NEGATIVE_WORDS.some((word) => lower.includes(word));
  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  return "neutral";
}

type FinnhubNewsItem = {
  headline: string;
  summary?: string;
  url?: string;
  source?: string;
  datetime: number;
};

async function fetchFinnhubNews(symbol: string): Promise<NewsItem[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 14);

  const url = new URL("https://finnhub.io/api/v1/company-news");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set(
    "from",
    from.toISOString().slice(0, 10),
  );
  url.searchParams.set("to", to.toISOString().slice(0, 10));
  url.searchParams.set("token", apiKey);

  const response = await fetch(url, { next: { revalidate: 0 } });
  if (!response.ok) return [];

  const data = (await response.json()) as FinnhubNewsItem[];
  return data.slice(0, 10).map((item) => ({
    title: item.headline,
    summary: item.summary ?? null,
    url: item.url ?? null,
    source: item.source ?? "Finnhub",
    publishedAt: new Date(item.datetime * 1000).toISOString(),
    sentiment: scoreHeadline(item.headline),
  }));
}

export async function fetchNews(symbol: string): Promise<NewsSnapshot> {
  const normalized = symbol.trim().toUpperCase();
  const cacheKey = `news:${normalized}`;
  const cached = getCached<NewsSnapshot>(cacheKey);
  if (cached) return cached;

  const finnhubItems = await fetchFinnhubNews(normalized);
  let items = finnhubItems;

  if (items.length === 0) {
    const search = await yahooFinance.search(normalized, { newsCount: 10 });
    items = (search.news ?? []).map((item) => ({
      title: item.title,
      summary: null,
      url: item.link ?? null,
      source: item.publisher ?? "Yahoo Finance",
      publishedAt: item.providerPublishTime
        ? new Date(item.providerPublishTime).toISOString()
        : new Date().toISOString(),
      sentiment: scoreHeadline(item.title),
    }));
  }

  const positiveCount = items.filter((i) => i.sentiment === "positive").length;
  const negativeCount = items.filter((i) => i.sentiment === "negative").length;
  const neutralCount = items.length - positiveCount - negativeCount;

  let overallSentiment: NewsSnapshot["overallSentiment"] = "neutral";
  if (positiveCount > negativeCount + 1) overallSentiment = "positive";
  else if (negativeCount > positiveCount + 1) overallSentiment = "negative";

  const snapshot: NewsSnapshot = {
    symbol: normalized,
    items,
    overallSentiment,
    positiveCount,
    negativeCount,
    neutralCount,
    fetchedAt: new Date().toISOString(),
  };

  setCached(cacheKey, snapshot, ANALYSIS_CACHE_TTL_MS);
  return snapshot;
}
