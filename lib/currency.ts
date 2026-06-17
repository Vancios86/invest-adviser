import { fetchQuotes } from "@/lib/quotes";

export async function fetchEurUsdRate(): Promise<number | null> {
  try {
    const quotes = await fetchQuotes(["EURUSD=X"]);
    const rate = quotes["EURUSD=X"]?.price;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
