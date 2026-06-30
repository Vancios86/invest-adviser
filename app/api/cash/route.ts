import { NextResponse } from "next/server";
import { getCashBalances, updateCashBalances } from "@/lib/cash";

export async function GET() {
  try {
    const balances = await getCashBalances();
    return NextResponse.json(balances);
  } catch (error) {
    console.error("Failed to load cash balances:", error);
    return NextResponse.json(
      { error: "Failed to load cash balances" },
      { status: 500 },
    );
  }
}

function parseCash(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return num;
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const cashUsd = parseCash(body.cashUsd, "USD cash");
    const cashEur = parseCash(body.cashEur, "EUR cash");

    if (cashUsd === undefined && cashEur === undefined) {
      return NextResponse.json(
        { error: "Provide cashUsd and/or cashEur to update" },
        { status: 400 },
      );
    }

    const balances = await updateCashBalances({ cashUsd, cashEur });
    return NextResponse.json(balances);
  } catch (error) {
    console.error("Failed to update cash balances:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update cash balances",
      },
      { status: 400 },
    );
  }
}
