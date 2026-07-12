import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchIndicators } from "@/lib/indicators";
import { runBoardPipeline } from "@/lib/market/board";
import { runBoardWithGemini } from "@/lib/market/board-gemini";
import { fetchMarketSnapshot } from "@/lib/market/market-data";
import { buildWatchlistTimingReport, mergeTimingUniverse } from "@/lib/watchlist/timing";

export async function GET() {
  try {
    const [snapshot, watchlistItems, holdings] = await Promise.all([
      fetchMarketSnapshot(),
      db.watchlistItem.findMany({ orderBy: { createdAt: "desc" } }),
      db.holding.findMany({ orderBy: { symbol: "asc" } }),
    ]);

    const baseline = runBoardPipeline(snapshot);

    const timingUniverse = mergeTimingUniverse(
      watchlistItems.map((item) => ({
        symbol: item.symbol,
        quoteSymbol: item.quoteSymbol,
        companyName: item.companyName,
        targetPrice: item.targetPrice,
      })),
      holdings.map((holding) => ({
        symbol: holding.symbol,
        quoteSymbol: holding.quoteSymbol,
      })),
    );

    const watchlistTiming = await buildWatchlistTimingReport(
      timingUniverse,
      baseline.regime,
      fetchIndicators,
    );

    const report = await runBoardWithGemini({ ...baseline, watchlistTiming });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to run market board:", error);
    return NextResponse.json(
      { error: "Failed to generate the market briefing" },
      { status: 500 },
    );
  }
}
