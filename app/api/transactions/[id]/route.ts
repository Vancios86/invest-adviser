import { NextResponse } from "next/server";
import { deleteTransaction } from "@/lib/transactions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await deleteTransaction(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to delete transaction:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete transaction";
    const status = message === "Transaction not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
