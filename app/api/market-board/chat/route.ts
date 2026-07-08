import { NextResponse } from "next/server";
import { runBoardChat } from "@/lib/market/board-chat";
import type { BoardChatMessage, BoardRole, MarketBoardReport } from "@/lib/types";

const BOARD_ROLES = new Set<BoardRole>([
  "macro",
  "sector_rotation",
  "institutional_flow",
  "geopolitical",
  "chief_strategist",
]);

function isBoardChatMessage(value: unknown): value is BoardChatMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as { role?: unknown; content?: unknown };
  return (
    (record.role === "user" || record.role === "assistant") &&
    typeof record.content === "string" &&
    record.content.trim().length > 0
  );
}

function isMarketBoardReport(value: unknown): value is MarketBoardReport {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MarketBoardReport>;
  return (
    typeof record.regime === "string" &&
    typeof record.executiveSummary === "string" &&
    Array.isArray(record.members) &&
    !!record.snapshot &&
    typeof record.generatedAt === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = Array.isArray(body.messages)
      ? body.messages.filter(isBoardChatMessage)
      : [];
    const report = body.report;
    const memberRole =
      typeof body.memberRole === "string" && BOARD_ROLES.has(body.memberRole as BoardRole)
        ? (body.memberRole as BoardRole)
        : undefined;

    if (messages.length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (!isMarketBoardReport(report)) {
      return NextResponse.json(
        { error: "A valid board briefing is required. Open the board briefing first." },
        { status: 400 },
      );
    }

    const result = await runBoardChat({
      messages,
      report,
      memberRole,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Board chat failed:", error);
    return NextResponse.json(
      { error: "Failed to get a response from the board" },
      { status: 500 },
    );
  }
}
