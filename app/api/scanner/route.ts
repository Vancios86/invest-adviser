import { NextResponse } from "next/server";
import { runOpportunityScan } from "@/lib/scanner/scan";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const minRelVolRaw = searchParams.get("minRelVol");
    const limitRaw = searchParams.get("limit");

    const minRelativeVolume = minRelVolRaw ? Number(minRelVolRaw) : undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const report = await runOpportunityScan({
      minRelativeVolume:
        minRelativeVolume && Number.isFinite(minRelativeVolume)
          ? minRelativeVolume
          : undefined,
      limit: limit && Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to run opportunity scan:", error);
    return NextResponse.json(
      { error: "Failed to run the opportunity scan" },
      { status: 500 },
    );
  }
}
