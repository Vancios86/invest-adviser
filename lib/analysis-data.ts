import { fetchFinancials } from "@/lib/financials";
import { fetchIndicators } from "@/lib/indicators";
import { fetchNews } from "@/lib/news";
import type { StockDataBundle } from "@/lib/types";

export async function fetchStockData(symbol: string): Promise<StockDataBundle> {
  const normalized = symbol.trim().toUpperCase();

  const [financials, indicators, news] = await Promise.all([
    fetchFinancials(normalized),
    fetchIndicators(normalized),
    fetchNews(normalized),
  ]);

  return {
    symbol: normalized,
    financials,
    indicators,
    news,
  };
}
