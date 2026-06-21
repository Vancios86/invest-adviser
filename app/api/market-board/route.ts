import { NextResponse } from "next/server";
import { runBoardPipeline } from "@/lib/market/board";
import { runBoardWithGemini } from "@/lib/market/board-gemini";
import { fetchMarketSnapshot } from "@/lib/market/market-data";

export async function GET() {
  try {
    const snapshot = await fetchMarketSnapshot();
    const baseline = runBoardPipeline(snapshot);
    const report = await runBoardWithGemini(baseline);

    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to run market board:", error);
    return NextResponse.json(
      { error: "Failed to generate the market briefing" },
      { status: 500 },
    );
  }
}
