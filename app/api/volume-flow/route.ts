import { NextResponse } from "next/server";
import { fetchIndicators } from "@/lib/indicators";

export async function GET(request: Request) {
  const symbolsParam = new URL(request.url).searchParams.get("symbols");

  if (!symbolsParam) {
    return NextResponse.json(
      { error: "Missing symbols query parameter" },
      { status: 400 },
    );
  }

  const symbols = [
    ...new Set(
      symbolsParam
        .split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  if (symbols.length === 0) {
    return NextResponse.json({});
  }

  try {
    const entries = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const indicators = await fetchIndicators(symbol);
          return [symbol, indicators.buyVolumePct20] as const;
        } catch (error) {
          console.error(`Failed to fetch volume flow for ${symbol}:`, error);
          return [symbol, null] as const;
        }
      }),
    );

    return NextResponse.json(Object.fromEntries(entries));
  } catch (error) {
    console.error("Volume flow API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch buy/sell volume metrics" },
      { status: 500 },
    );
  }
}
