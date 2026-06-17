import { NextResponse } from "next/server";
import { fetchEurUsdRate } from "@/lib/currency";

export async function GET() {
  const eurUsd = await fetchEurUsdRate();
  return NextResponse.json({ eurUsd });
}
