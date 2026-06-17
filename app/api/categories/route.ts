import { NextResponse } from "next/server";
import { fetchCategoryMetadata } from "@/lib/financials";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");

  if (!symbolsParam) {
    return NextResponse.json(
      { error: "Missing symbols query parameter" },
      { status: 400 },
    );
  }

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const unique = [...new Set(symbols)].slice(0, 50);

  const entries = await Promise.all(
    unique.map(async (symbol) => {
      const metadata = await fetchCategoryMetadata(symbol);
      return [symbol, metadata] as const;
    }),
  );

  return NextResponse.json(Object.fromEntries(entries));
}
