import { NextResponse } from "next/server";
import { fetchStockData } from "@/lib/analysis-data";
import { isValidSymbolFormat } from "@/lib/symbols";

type RouteContext = {
  params: Promise<{ symbol: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const normalized = symbol.trim().toUpperCase();

    if (!normalized || !isValidSymbolFormat(normalized)) {
      return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
    }

    const data = await fetchStockData(normalized);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch analysis data:", error);
    return NextResponse.json(
      { error: "Failed to fetch analysis data for this symbol" },
      { status: 500 },
    );
  }
}
