import { NextResponse } from "next/server";
import { listTransactions } from "@/lib/transactions";

export async function GET() {
  try {
    const transactions = await listTransactions();
    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("Failed to load transactions:", error);
    return NextResponse.json(
      { error: "Failed to load transactions" },
      { status: 500 },
    );
  }
}
