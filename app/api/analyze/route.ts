import { NextResponse } from "next/server";
import { runAnalysisPipeline } from "@/lib/agents/pipeline";
import { fetchStockData } from "@/lib/analysis-data";
import { db } from "@/lib/db";
import {
  computePortfolioSummary,
  enrichHoldings,
} from "@/lib/portfolio";
import { fetchQuotes } from "@/lib/quotes";
import type { PositionContext } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const symbol = String(body.symbol ?? "")
      .trim()
      .toUpperCase();
    const holdingId = body.holdingId ? String(body.holdingId) : undefined;

    if (!symbol || !/^[A-Z0-9.\-^]{1,10}$/.test(symbol)) {
      return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
    }

    const [data, holdings, quotes] = await Promise.all([
      fetchStockData(symbol),
      db.holding.findMany(),
      fetchQuotes([symbol]),
    ]);

    const enriched = enrichHoldings(holdings, quotes);
    const portfolioSummary = computePortfolioSummary(enriched);

    let position: PositionContext | undefined;
    if (holdingId) {
      const holding = enriched.find((h) => h.id === holdingId);
      if (holding) {
        position = {
          shares: holding.shares,
          purchasePrice: holding.purchasePrice,
          livePrice: holding.livePrice,
          gainLossPct: holding.gainLossPct,
          portfolioWeight: holding.portfolioWeight,
        };
      }
    } else {
      const aggregated = enriched.filter((h) => h.symbol === symbol);
      if (aggregated.length > 0) {
        const totalShares = aggregated.reduce((sum, h) => sum + h.shares, 0);
        const totalCost = aggregated.reduce((sum, h) => sum + h.costBasis, 0);
        const avgPrice = totalCost / totalShares;
        const livePrice = aggregated[0]?.livePrice ?? null;
        const currentValue = aggregated.reduce(
          (sum, h) => sum + (h.currentValue ?? 0),
          0,
        );
        position = {
          shares: totalShares,
          purchasePrice: avgPrice,
          livePrice,
          gainLossPct:
            livePrice !== null
              ? ((livePrice - avgPrice) / avgPrice) * 100
              : null,
          portfolioWeight:
            portfolioSummary.totalValue > 0
              ? (currentValue / portfolioSummary.totalValue) * 100
              : null,
        };
      }
    }

    const report = runAnalysisPipeline({
      symbol,
      companyName: data.financials.companyName,
      data,
      position,
      portfolioSummary,
    });

    const saved = await db.analysisReport.create({
      data: {
        symbol,
        holdingId: holdingId ?? null,
        recommendation: report.recommendation,
        confidence: report.confidence,
        executiveSummary: report.executiveSummary,
        agentOutputs: JSON.stringify(report.agentOutputs),
      },
    });

    return NextResponse.json({
      ...report,
      id: saved.id,
      data,
    });
  } catch (error) {
    console.error("Failed to run analysis:", error);
    return NextResponse.json(
      { error: "Failed to analyze this symbol" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const reports = await db.analysisReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json(
      reports.map((report) => ({
        id: report.id,
        symbol: report.symbol,
        holdingId: report.holdingId,
        recommendation: report.recommendation,
        confidence: report.confidence,
        executiveSummary: report.executiveSummary,
        agentOutputs: JSON.parse(report.agentOutputs),
        generatedAt: report.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    console.error("Failed to list analysis reports:", error);
    return NextResponse.json(
      { error: "Failed to load analysis history" },
      { status: 500 },
    );
  }
}
