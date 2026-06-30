import { runBoardPipeline } from "@/lib/market/board";
import { fetchMarketSnapshot } from "@/lib/market/market-data";
import type { MarketRegime } from "@/lib/types";

export async function getMarketRegime(): Promise<{
  regime: MarketRegime;
  confidence: number;
}> {
  try {
    const snapshot = await fetchMarketSnapshot();
    const board = runBoardPipeline(snapshot);
    return { regime: board.regime, confidence: board.confidence };
  } catch (error) {
    console.error("Failed to read market regime:", error);
    return { regime: "mixed", confidence: 0 };
  }
}
