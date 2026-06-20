import { NextResponse } from "next/server";
import { runAnalysisPipeline } from "@/lib/agents/pipeline";
import { fetchEurUsdRate } from "@/lib/currency";
import { fetchStockData } from "@/lib/analysis-data";
import { db } from "@/lib/db";
import { runAnalysisWithGemini } from "@/lib/llm/gemini";
import {
  aggregatePositionFromHoldings,
  computePortfolioSummary,
  enrichHoldings,
} from "@/lib/portfolio";
import { fetchQuotes } from "@/lib/quotes";
import { getQuoteSymbol } from "@/lib/holding-utils";
import { isValidSymbolFormat } from "@/lib/symbols";
import type { PositionContext } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const symbol = String(body.symbol ?? "")
      .trim()
      .toUpperCase();
    const holdingId = body.holdingId ? String(body.holdingId) : undefined;

    if (!symbol || !isValidSymbolFormat(symbol)) {
      return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
    }

    const holdingRecord = holdingId
      ? await db.holding.findUnique({ where: { id: holdingId } })
      : null;
    const quoteSymbol = holdingRecord
      ? getQuoteSymbol(holdingRecord)
      : symbol;

    const holdings = await db.holding.findMany();
    const quoteSymbols = [
      ...new Set([
        ...holdings.map((holding) => getQuoteSymbol(holding)),
        quoteSymbol,
      ]),
    ];

    const [data, quotes, eurUsdRate] = await Promise.all([
      fetchStockData(quoteSymbol),
      fetchQuotes(quoteSymbols),
      fetchEurUsdRate(),
    ]);

    const enriched = enrichHoldings(holdings, quotes, eurUsdRate);
    const portfolioSummary = computePortfolioSummary(enriched, eurUsdRate);

    let position: PositionContext | undefined;
    if (holdingId) {
      const holding = enriched.find((h) => h.id === holdingId);
      if (holding) {
        position = {
          shares: holding.shares,
          purchasePrice: holding.purchasePrice,
          purchaseCurrency: holding.purchaseCurrency,
          quoteCurrency: holding.quoteCurrency,
          livePrice: holding.livePrice,
          gainLossPct: holding.gainLossPct,
          portfolioWeight: holding.portfolioWeight,
        };
      }
    } else {
      const aggregated = enriched.filter((h) => h.symbol === symbol);
      if (aggregated.length > 0) {
        position =
          aggregatePositionFromHoldings(
            aggregated,
            portfolioSummary.totalValue,
            eurUsdRate,
          ) ?? undefined;
      }
    }

    const baseline = runAnalysisPipeline({
      symbol,
      companyName: data.financials.companyName,
      data,
      position,
      portfolioSummary,
    });

    const report = await runAnalysisWithGemini(
      {
        symbol,
        companyName: data.financials.companyName,
        data,
        position,
        portfolioSummary,
      },
      baseline,
    );

    const saved = await db.analysisReport.create({
      data: {
        symbol,
        holdingId: holdingId ?? null,
        recommendation: report.recommendation,
        confidence: report.confidence,
        executiveSummary: report.executiveSummary,
        agentOutputs: JSON.stringify(report.agentOutputs),
        analysisMode: report.analysisMode ?? "rules",
        llmModel: report.llmModel ?? null,
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
        analysisMode: report.analysisMode,
        llmModel: report.llmModel,
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
