import { NextResponse } from "next/server";
import { fetchFinancials } from "@/lib/financials";

type CategoryMetadata = {
  sector: string | null;
  industry: string | null;
  companyName: string | null;
};

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

  try {
    const results = await Promise.allSettled(
      unique.map(async (symbol) => {
        const financials = await fetchFinancials(symbol);
        return [
          symbol,
          {
            sector: financials.sector,
            industry: financials.industry,
            companyName: financials.companyName,
          } satisfies CategoryMetadata,
        ] as const;
      }),
    );

    const entries = results.map((result, idx) => {
      const symbol = unique[idx]!;
      if (result.status === "fulfilled") return result.value;

      return [
        symbol,
        {
          sector: null,
          industry: null,
          companyName: null,
        } satisfies CategoryMetadata,
      ] as const;
    });

    return NextResponse.json(Object.fromEntries(entries));
  } catch (error) {
    console.error("Categories API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 },
    );
  }
}

