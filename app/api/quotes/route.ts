import { NextResponse } from "next/server";
import { fetchQuotes, QuoteFetchError } from "@/lib/quotes";

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
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const quotes = await fetchQuotes(symbols);
    return NextResponse.json(quotes);
  } catch (error) {
    if (error instanceof QuoteFetchError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("Quotes API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch live market data" },
      { status: 500 },
    );
  }
}
