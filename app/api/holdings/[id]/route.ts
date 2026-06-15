import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateSymbol } from "@/lib/quotes";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await db.holding.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    const data: {
      symbol?: string;
      shares?: number;
      purchasePrice?: number;
      purchaseDate?: Date | null;
    } = {};

    if (body.symbol !== undefined) {
      const symbol = String(body.symbol).trim().toUpperCase();
      if (!symbol || !/^[A-Z0-9.\-^]{1,10}$/.test(symbol)) {
        return NextResponse.json(
          { error: "Invalid symbol format" },
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
      data.symbol = symbol;
    }

    if (body.shares !== undefined) {
      const shares = Number(body.shares);
      if (!Number.isFinite(shares) || shares <= 0) {
        return NextResponse.json(
          { error: "Shares must be a positive number" },
          { status: 400 },
        );
      }
      data.shares = shares;
    }

    if (body.purchasePrice !== undefined) {
      const purchasePrice = Number(body.purchasePrice);
      if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
        return NextResponse.json(
          { error: "Purchase price must be a positive number" },
          { status: 400 },
        );
      }
      data.purchasePrice = purchasePrice;
    }

    if (body.purchaseDate !== undefined) {
      data.purchaseDate = body.purchaseDate
        ? new Date(body.purchaseDate)
        : null;
    }

    const holding = await db.holding.update({
      where: { id },
      data,
    });

    return NextResponse.json(holding);
  } catch (error) {
    console.error("Failed to update holding:", error);
    return NextResponse.json(
      { error: "Failed to update holding" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const existing = await db.holding.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    await db.holding.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete holding:", error);
    return NextResponse.json(
      { error: "Failed to delete holding" },
      { status: 500 },
    );
  }
}
