import { NextResponse } from "next/server";
import { runAnalysisPipeline } from "@/lib/agents/pipeline";
import { buildCompanyIntro } from "@/lib/analysis/company-intro";
import { fetchEurUsdRate } from "@/lib/currency";
import { fetchStockData } from "@/lib/analysis-data";
import { db } from "@/lib/db";
import { runAnalysisWithGemini } from "@/lib/llm/gemini";
import { getMarketRegime } from "@/lib/market/regime";
import {
  aggregatePositionFromHoldings,
  computePortfolioSummary,
  enrichHoldings,
} from "@/lib/portfolio";
import { fetchQuotes } from "@/lib/quotes";
import { getQuoteSymbol } from "@/lib/holding-utils";
import { parseAssetType, resolveSymbolOrCompanyName } from "@/lib/symbols";
import {
  scoreStockTiming,
  WATCHLIST_TIMING_DISCLAIMER,
} from "@/lib/watchlist/timing";
import type { PositionContext } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawInput = String(body.symbol ?? body.query ?? "").trim();
    const holdingId = body.holdingId ? String(body.holdingId) : undefined;

    const holdingRecord = holdingId
      ? await db.holding.findUnique({ where: { id: holdingId } })
      : null;

    let symbol: string;
    let quoteSymbol: string;

    if (holdingRecord) {
      symbol = holdingRecord.symbol;
      quoteSymbol = getQuoteSymbol(holdingRecord);
    } else {
      if (!rawInput) {
        return NextResponse.json(
          { error: "Enter a ticker symbol or company name" },
          { status: 400 },
        );
      }

      const resolved = await resolveSymbolOrCompanyName(
        rawInput,
        parseAssetType(body.assetType),
      );
      if (!resolved) {
        return NextResponse.json(
          {
            error: `Could not find live market data for "${rawInput}". Try a ticker (e.g. NVDA) or company name (e.g. Apple).`,
          },
          { status: 400 },
        );
      }

      symbol = resolved.symbol;
      quoteSymbol = resolved.quoteSymbol;
    }

    const holdings = await db.holding.findMany();
    const quoteSymbols = [
      ...new Set([
        ...holdings.map((holding) => getQuoteSymbol(holding)),
        quoteSymbol,
      ]),
    ];

    const [data, quotes, eurUsdRate, regimeContext, watchlistItem] =
      await Promise.all([
      fetchStockData(quoteSymbol),
      fetchQuotes(quoteSymbols),
      fetchEurUsdRate(),
      getMarketRegime(),
      db.watchlistItem.findFirst({ where: { symbol } }),
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

    const companyIntro = buildCompanyIntro(data.financials);
    const timing = scoreStockTiming({
      symbol,
      quoteSymbol,
      companyName: data.financials.companyName,
      indicators: data.indicators,
      regime: regimeContext.regime,
      targetPrice: watchlistItem?.targetPrice ?? null,
    });

    const enrichedReport = {
      ...report,
      companyIntro,
      timing,
      timingDisclaimer: WATCHLIST_TIMING_DISCLAIMER,
    };

    const saved = await db.analysisReport.create({
      data: {
        symbol,
        ...(holdingId
          ? { holding: { connect: { id: holdingId } } }
          : {}),
        recommendation: report.recommendation,
        confidence: report.confidence,
        executiveSummary: report.executiveSummary,
        agentOutputs: JSON.stringify(report.agentOutputs),
        companyIntro,
        timing: JSON.stringify(timing),
        timingDisclaimer: WATCHLIST_TIMING_DISCLAIMER,
        analysisMode: report.analysisMode ?? "rules",
        llmModel: report.llmModel ?? null,
      },
    });

    return NextResponse.json({
      ...enrichedReport,
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
        companyIntro: report.companyIntro,
        timing: report.timing ? JSON.parse(report.timing) : null,
        timingDisclaimer: report.timingDisclaimer,
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
