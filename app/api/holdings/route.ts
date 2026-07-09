import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  defaultPurchaseCurrency,
  parsePurchaseCurrency,
} from "@/lib/currency-utils";
import { fetchEurUsdRate } from "@/lib/currency";
import { mergePurchaseLots } from "@/lib/holding-utils";
import {
  parseAssetType,
  resolveSymbolOrCompanyName,
} from "@/lib/symbols";
import { createTransaction } from "@/lib/transactions";

export async function GET() {
  const holdings = await db.holding.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(holdings);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawInput = String(body.symbol ?? body.query ?? "").trim();
    const assetType = parseAssetType(body.assetType);
    const shares = Number(body.shares);
    const purchasePrice = Number(body.purchasePrice);
    const purchaseCurrency = body.purchaseCurrency
      ? parsePurchaseCurrency(body.purchaseCurrency)
      : undefined;
    const purchaseDate = body.purchaseDate
      ? new Date(body.purchaseDate)
      : undefined;

    if (!rawInput) {
      return NextResponse.json(
        { error: "Enter a ticker symbol or company name" },
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

    const resolved = await resolveSymbolOrCompanyName(rawInput, assetType);
    if (!resolved) {
      return NextResponse.json(
        {
          error: `Could not find live market data for "${rawInput}". Try a ticker (e.g. AAPL) or company name (e.g. Apple).`,
        },
        { status: 400 },
      );
    }

    const newPurchaseCurrency =
      purchaseCurrency ??
      defaultPurchaseCurrency(resolved.assetType, resolved.currency);

    const existing = await db.holding.findFirst({
      where: { symbol: resolved.symbol },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      const eurUsdRate = await fetchEurUsdRate();
      const merged = mergePurchaseLots(
        {
          shares: existing.shares,
          purchasePrice: existing.purchasePrice,
          purchaseCurrency: parsePurchaseCurrency(existing.purchaseCurrency),
        },
        {
          shares,
          purchasePrice,
          purchaseCurrency: newPurchaseCurrency,
        },
        eurUsdRate,
      );

      const holding = await db.holding.update({
        where: { id: existing.id },
        data: {
          quoteSymbol:
            resolved.quoteSymbol !== resolved.symbol ? resolved.quoteSymbol : null,
          assetType: resolved.assetType,
          shares: merged.shares,
          purchasePrice: merged.purchasePrice,
          purchaseCurrency: merged.purchaseCurrency,
        },
      });

      await createTransaction({
        type: "buy",
        symbol: resolved.symbol,
        quoteSymbol:
          resolved.quoteSymbol !== resolved.symbol ? resolved.quoteSymbol : null,
        assetType: resolved.assetType,
        companyName: resolved.companyName,
        shares,
        price: purchasePrice,
        currency: newPurchaseCurrency,
      });

      return NextResponse.json({
        ...holding,
        companyName: resolved.companyName,
      });
    }

    const holding = await db.holding.create({
      data: {
        symbol: resolved.symbol,
        quoteSymbol:
          resolved.quoteSymbol !== resolved.symbol ? resolved.quoteSymbol : null,
        assetType: resolved.assetType,
        shares,
        purchasePrice,
        purchaseCurrency: newPurchaseCurrency,
        purchaseDate,
      },
    });

    await createTransaction({
      type: "buy",
      symbol: resolved.symbol,
      quoteSymbol:
        resolved.quoteSymbol !== resolved.symbol ? resolved.quoteSymbol : null,
      assetType: resolved.assetType,
      companyName: resolved.companyName,
      shares,
      price: purchasePrice,
      currency: newPurchaseCurrency,
    });

    return NextResponse.json(
      { ...holding, companyName: resolved.companyName },
      { status: 201 },
    );
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
