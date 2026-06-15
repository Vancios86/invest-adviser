import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateSymbol } from "@/lib/quotes";

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
    const shares = Number(body.shares);
    const purchasePrice = Number(body.purchasePrice);
    const purchaseDate = body.purchaseDate
      ? new Date(body.purchaseDate)
      : undefined;

    if (!symbol || !/^[A-Z0-9.\-^]{1,10}$/.test(symbol)) {
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

    const isValid = await validateSymbol(symbol);
    if (!isValid) {
      return NextResponse.json(
        { error: `Could not find a valid quote for symbol "${symbol}"` },
        { status: 400 },
      );
    }

    const holding = await db.holding.create({
      data: {
        symbol,
        shares,
        purchasePrice,
        purchaseDate,
      },
    });

    return NextResponse.json(holding, { status: 201 });
  } catch (error) {
    console.error("Failed to create holding:", error);
    return NextResponse.json(
      { error: "Failed to create holding" },
      { status: 500 },
    );
  }
}
