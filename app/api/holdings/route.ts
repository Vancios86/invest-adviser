import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  defaultPurchaseCurrency,
  parsePurchaseCurrency,
} from "@/lib/currency-utils";
import {
  isValidSymbolFormat,
  parseAssetType,
  resolveQuoteSymbol,
} from "@/lib/symbols";

export async function GET() {
  const holdings = await db.holding.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(holdings);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const symbol = String(body.symbol ?? "")
      .trim()
      .toUpperCase();
    const assetType = parseAssetType(body.assetType);
    const shares = Number(body.shares);
    const purchasePrice = Number(body.purchasePrice);
    const purchaseCurrency = body.purchaseCurrency
      ? parsePurchaseCurrency(body.purchaseCurrency)
      : undefined;
    const purchaseDate = body.purchaseDate
      ? new Date(body.purchaseDate)
      : undefined;

    if (!symbol || !isValidSymbolFormat(symbol)) {
      return NextResponse.json(
        { error: "Invalid symbol format" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(shares) || shares <= 0) {
      return NextResponse.json(
        { error: "Shares must be a positive number" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
      return NextResponse.json(
        { error: "Purchase price must be a positive number" },
        { status: 400 },
      );
    }

    const resolved = await resolveQuoteSymbol(symbol, assetType);
    if (!resolved) {
      return NextResponse.json(
        {
          error: `Could not find live market data for "${symbol}". Try the full Yahoo symbol (e.g. 4GLD.DE) or check the asset type.`,
        },
        { status: 400 },
      );
    }

    const holding = await db.holding.create({
      data: {
        symbol: resolved.symbol,
        quoteSymbol:
          resolved.quoteSymbol !== resolved.symbol ? resolved.quoteSymbol : null,
        assetType: resolved.assetType,
        shares,
        purchasePrice,
        purchaseCurrency:
          purchaseCurrency ??
          defaultPurchaseCurrency(resolved.assetType, resolved.currency),
        purchaseDate,
      },
    });

    return NextResponse.json(holding, { status: 201 });
  } catch (error) {
    console.error("Failed to create holding:", error);

    const message =
      error instanceof Error &&
      error.name === "PrismaClientValidationError"
        ? "Database schema is out of date. Stop the dev server and run: npm run dev"
        : "Failed to create holding";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
