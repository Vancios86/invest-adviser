import { NextResponse } from "next/server";
import { addCashProceeds, getCashBalances } from "@/lib/cash";
import { parsePurchaseCurrency } from "@/lib/currency-utils";
import { fetchEurUsdRate } from "@/lib/currency";
import { db } from "@/lib/db";
import { getQuoteSymbol } from "@/lib/holding-utils";
import { fetchQuotes } from "@/lib/quotes";
import {
  computeSellCostBasis,
  createTransaction,
} from "@/lib/transactions";
import type { PortfolioCurrency } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseSaleCurrency(value: unknown): PortfolioCurrency | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return parsePurchaseCurrency(value);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const holding = await db.holding.findUnique({ where: { id } });
    if (!holding) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    const sharesToSell =
      body.shares !== undefined ? Number(body.shares) : holding.shares;

    if (!Number.isFinite(sharesToSell) || sharesToSell <= 0) {
      return NextResponse.json(
        { error: "Shares to sell must be a positive number" },
        { status: 400 },
      );
    }

    if (sharesToSell > holding.shares + 1e-9) {
      return NextResponse.json(
        { error: `Cannot sell more than ${holding.shares} shares` },
        { status: 400 },
      );
    }

    const purchaseCurrency = parsePurchaseCurrency(holding.purchaseCurrency);
    const eurUsdRate = await fetchEurUsdRate();

    let salePrice =
      body.salePrice !== undefined ? Number(body.salePrice) : undefined;

    if (salePrice !== undefined && (!Number.isFinite(salePrice) || salePrice <= 0)) {
      return NextResponse.json(
        { error: "Sale price must be a positive number" },
        { status: 400 },
      );
    }

    const quotes = await fetchQuotes([getQuoteSymbol(holding)]);
    const quote = quotes[getQuoteSymbol(holding)];
    const quoteCurrency: PortfolioCurrency =
      quote?.currency === "EUR" ? "EUR" : "USD";

    if (salePrice === undefined) {
      if (!quote?.price) {
        return NextResponse.json(
          {
            error:
              "Live price unavailable — enter a sale price manually to record the sell",
          },
          { status: 400 },
        );
      }
      salePrice = quote.price;
    }

    const saleCurrency =
      parseSaleCurrency(body.currency) ?? quoteCurrency ?? purchaseCurrency;

    const costBasis = computeSellCostBasis(
      sharesToSell,
      holding.purchasePrice,
      purchaseCurrency,
      saleCurrency,
      eurUsdRate,
    );
    const proceeds = sharesToSell * salePrice;
    const gainLossAbs = proceeds - costBasis;
    const gainLossPct =
      costBasis > 0 ? (gainLossAbs / costBasis) * 100 : null;

    const transaction = await createTransaction({
      type: "sell",
      symbol: holding.symbol,
      quoteSymbol: holding.quoteSymbol,
      assetType: holding.assetType,
      companyName: quote?.companyName ?? null,
      shares: sharesToSell,
      price: salePrice,
      currency: saleCurrency,
      costBasis,
      gainLossAbs,
      gainLossPct,
    });

    await addCashProceeds(proceeds, saleCurrency);

    const remainingShares = holding.shares - sharesToSell;
    if (remainingShares <= 1e-9) {
      await db.holding.delete({ where: { id } });
    } else {
      await db.holding.update({
        where: { id },
        data: { shares: remainingShares },
      });
    }

    const cash = await getCashBalances();

    return NextResponse.json({
      transaction,
      remainingShares: remainingShares > 1e-9 ? remainingShares : 0,
      proceeds,
      gainLossAbs,
      gainLossPct,
      cash,
    });
  } catch (error) {
    console.error("Failed to sell holding:", error);
    return NextResponse.json(
      { error: "Failed to record sale" },
      { status: 500 },
    );
  }
}
