import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await db.watchlistItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Watchlist item not found" },
        { status: 404 },
      );
    }

    const data: { note?: string | null; targetPrice?: number | null } = {};

    if (body.note !== undefined) {
      const note = body.note === null ? null : String(body.note).trim();
      data.note = note && note.length > 0 ? note.slice(0, 500) : null;
    }

    if (body.targetPrice !== undefined) {
      if (body.targetPrice === null || body.targetPrice === "") {
        data.targetPrice = null;
      } else {
        const num = Number(body.targetPrice);
        if (!Number.isFinite(num) || num <= 0) {
          return NextResponse.json(
            { error: "Target price must be a positive number" },
            { status: 400 },
          );
        }
        data.targetPrice = num;
      }
    }

    const updated = await db.watchlistItem.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update watchlist item:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist item" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const existing = await db.watchlistItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Watchlist item not found" },
        { status: 404 },
      );
    }

    await db.watchlistItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete watchlist item:", error);
    return NextResponse.json(
      { error: "Failed to delete watchlist item" },
      { status: 500 },
    );
  }
}
