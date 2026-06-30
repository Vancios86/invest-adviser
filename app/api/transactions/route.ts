import { NextResponse } from "next/server";
import { PORTFOLIO_BASE_CURRENCY } from "@/lib/currency-utils";
import { fetchEurUsdRate } from "@/lib/currency";
import {
  computeRealizedGainLoss,
  listTransactions,
} from "@/lib/transactions";

export async function GET() {
  try {
    const [transactions, eurUsdRate] = await Promise.all([
      listTransactions(),
      fetchEurUsdRate(),
    ]);

    const realizedGainLoss = computeRealizedGainLoss(
      transactions,
      PORTFOLIO_BASE_CURRENCY,
      eurUsdRate,
    );

    return NextResponse.json({ transactions, realizedGainLoss });
  } catch (error) {
    console.error("Failed to load transactions:", error);
    return NextResponse.json(
      { error: "Failed to load transactions" },
      { status: 500 },
    );
  }
}
