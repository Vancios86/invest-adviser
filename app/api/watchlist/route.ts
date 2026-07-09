import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  parseAssetType,
  resolveSymbolOrCompanyName,
} from "@/lib/symbols";

export async function GET() {
  try {
    const items = await db.watchlistItem.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("Failed to load watchlist:", error);
    return NextResponse.json(
      { error: "Failed to load watchlist" },
      { status: 500 },
    );
  }
}

function parseTargetPrice(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("Target price must be a positive number");
  }
  return num;
}

function parseNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const note = String(value).trim();
  return note.length > 0 ? note.slice(0, 500) : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawInput = String(body.symbol ?? body.query ?? "").trim();
    const assetType = parseAssetType(body.assetType);

    if (!rawInput) {
      return NextResponse.json(
        { error: "Enter a ticker symbol or company name" },
        { status: 400 },
      );
    }

    let targetPrice: number | null;
    try {
      targetPrice = parseTargetPrice(body.targetPrice);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid target price" },
        { status: 400 },
      );
    }
    const note = parseNote(body.note);

    const resolved = await resolveSymbolOrCompanyName(rawInput, assetType);
    if (!resolved) {
      return NextResponse.json(
        {
          error: `Could not find live market data for "${rawInput}". Try a ticker (e.g. NVDA) or company name (e.g. NVIDIA).`,
        },
        { status: 400 },
      );
    }

    const quoteSymbol =
      resolved.quoteSymbol !== resolved.symbol ? resolved.quoteSymbol : null;

    const existing = await db.watchlistItem.findUnique({
      where: { symbol: resolved.symbol },
    });

    if (existing) {
      const updated = await db.watchlistItem.update({
        where: { id: existing.id },
        data: {
          quoteSymbol,
          assetType: resolved.assetType,
          companyName: resolved.companyName ?? existing.companyName,
          note: note ?? existing.note,
          targetPrice: targetPrice ?? existing.targetPrice,
        },
      });
      return NextResponse.json(updated);
    }

    const created = await db.watchlistItem.create({
      data: {
        symbol: resolved.symbol,
        quoteSymbol,
        assetType: resolved.assetType,
        companyName: resolved.companyName,
        note,
        targetPrice,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to add watchlist item:", error);

    const message =
      error instanceof Error &&
      error.name === "PrismaClientValidationError"
        ? "Database schema is out of date. Stop the dev server and run: npm run dev"
        : "Failed to add to watchlist";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
