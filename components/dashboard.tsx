"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles, Telescope } from "lucide-react";
import { toast } from "sonner";
import { AddStockForm } from "@/components/add-stock-form";
import { AnalyzeStockBar } from "@/components/analyze-stock-bar";
import { HoldingsTable } from "@/components/holdings-table";
import { MarketBoardPanel } from "@/components/market-board-panel";
import { OpportunityScannerPanel } from "@/components/opportunity-scanner-panel";
import { PortfolioBubbleChart } from "@/components/portfolio-bubble-chart";
import { WatchlistPanel } from "@/components/watchlist-panel";
import { PortfolioCategoryPie } from "@/components/portfolio-category-pie";
import { PortfolioSummary } from "@/components/portfolio-summary";
import { StockAnalysisPanel } from "@/components/stock-analysis-panel";
import { TransactionHistory } from "@/components/transaction-history";
import { Button } from "@/components/ui/button";
import {
  aggregateBySymbol,
  computePortfolioSummary,
  enrichHoldings,
} from "@/lib/portfolio";
import type { Holding } from "@/lib/generated/prisma/client";
import type { HoldingWithQuote, QuotesMap, TransactionRecord } from "@/lib/types";

const QUOTE_REFRESH_MS = 5 * 60 * 1000;

export function Dashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<QuotesMap>({});
  const [eurUsdRate, setEurUsdRate] = useState<number | null>(null);
  const [categoryMeta, setCategoryMeta] = useState<
    Record<string, { sector: string | null; industry: string | null; companyName: string | null }>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisSymbol, setAnalysisSymbol] = useState<string | null>(null);
  const [analysisHolding, setAnalysisHolding] = useState<HoldingWithQuote | null>(
    null,
  );
  const [boardOpen, setBoardOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [watchlistRefreshToken, setWatchlistRefreshToken] = useState(0);
  const [cash, setCash] = useState({ cashUsd: 0, cashEur: 0 });
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [realizedGainLoss, setRealizedGainLoss] = useState(0);

  function openAnalysis(symbol: string, holding?: HoldingWithQuote) {
    setAnalysisSymbol(symbol);
    setAnalysisHolding(holding ?? null);
    setAnalysisOpen(true);
  }

  const loadQuotes = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) {
      setQuotes({});
      setEurUsdRate(null);
      setCategoryMeta({});
      return;
    }

    const uniqueSymbols = [...new Set(symbols.map((s) => s.toUpperCase()))];
    const [response, fxResponse, categoriesResponse] = await Promise.all([
      fetch(`/api/quotes?symbols=${encodeURIComponent(uniqueSymbols.join(","))}`),
      fetch("/api/fx"),
      fetch(`/api/categories?symbols=${encodeURIComponent(uniqueSymbols.join(","))}`),
    ]);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(
        body?.error ?? "Failed to fetch live market prices",
      );
    }

    const data = (await response.json()) as QuotesMap;
    setQuotes(data);

    if (fxResponse.ok) {
      const fx = (await fxResponse.json()) as { eurUsd: number | null };
      setEurUsdRate(fx.eurUsd);
    }

    if (categoriesResponse.ok) {
      const categories = (await categoriesResponse.json()) as Record<
        string,
        { sector: string | null; industry: string | null; companyName: string | null }
      >;
      setCategoryMeta(categories);
    }
  }, []);

  const loadPortfolioMeta = useCallback(async () => {
    const [cashResponse, txResponse] = await Promise.all([
      fetch("/api/cash"),
      fetch("/api/transactions"),
    ]);

    if (cashResponse.ok) {
      const cashData = (await cashResponse.json()) as {
        cashUsd: number;
        cashEur: number;
      };
      setCash(cashData);
    }

    if (txResponse.ok) {
      const txData = (await txResponse.json()) as {
        transactions: TransactionRecord[];
        realizedGainLoss: number;
      };
      setTransactions(txData.transactions);
      setRealizedGainLoss(txData.realizedGainLoss);
    }
  }, []);

  const loadHoldings = useCallback(async () => {
    const response = await fetch("/api/holdings");
    if (!response.ok) {
      throw new Error("Failed to load holdings");
    }

    const data = (await response.json()) as Holding[];
    setHoldings(data);
    await Promise.all([
      loadQuotes(data.map((h) => h.quoteSymbol ?? h.symbol)),
      loadPortfolioMeta(),
    ]);
  }, [loadQuotes, loadPortfolioMeta]);

  const refresh = useCallback(
    async (showToast = false) => {
      setIsRefreshing(true);
      setError(null);

      try {
        await loadHoldings();
        if (showToast) {
          toast.success("Live market prices refreshed");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to refresh portfolio";
        setError(message);
        if (showToast) {
          toast.error(message);
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [loadHoldings],
  );

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      setError(null);

      try {
        await loadHoldings();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load portfolio",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void init();
  }, [loadHoldings]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refresh(false);
    }, QUOTE_REFRESH_MS);

    return () => clearInterval(interval);
  }, [refresh]);

  const enrichedHoldings = useMemo(
    () => enrichHoldings(holdings, quotes, eurUsdRate),
    [holdings, quotes, eurUsdRate],
  );

  const bubbles = useMemo(
    () => aggregateBySymbol(enrichedHoldings, eurUsdRate),
    [enrichedHoldings, eurUsdRate],
  );

  const summary = useMemo(
    () =>
      computePortfolioSummary(
        enrichedHoldings,
        eurUsdRate,
        cash,
        realizedGainLoss,
      ),
    [enrichedHoldings, eurUsdRate, cash, realizedGainLoss],
  );

  const hasPortfolioOverview =
    holdings.length > 0 || cash.cashUsd > 0 || cash.cashEur > 0;

  const quotedCount = enrichedHoldings.filter(
    (h) => h.livePrice !== null,
  ).length;

  const quotesUpdatedAt = useMemo(() => {
    const timestamps = Object.values(quotes).map((quote) => quote.fetchedAt);
    if (timestamps.length === 0) return null;
    return timestamps.sort().at(-1) ?? null;
  }, [quotes]);

  const quoteSource = useMemo(() => {
    const sources = new Set(
      Object.values(quotes)
        .map((quote) => quote.source)
        .filter(Boolean),
    );
    if (sources.size === 0) return null;
    if (sources.size === 1) {
      return sources.has("finnhub") ? "Finnhub" : "Yahoo Finance";
    }
    return "Yahoo Finance & Finnhub";
  }, [quotes]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        Loading portfolio...
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invest Adviser</h1>
          <p className="text-muted-foreground">
            Manage your portfolio and visualize allocation at a glance
          </p>
          {quoteSource && quotesUpdatedAt && (
            <p className="text-xs text-muted-foreground/80 mt-1">
              Live prices from {quoteSource} · updated{" "}
              {new Date(quotesUpdatedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setScannerOpen(true)}>
            <Telescope className="mr-2 size-4" />
            Find Opportunities
          </Button>
          <Button onClick={() => setBoardOpen(true)}>
            <Sparkles className="mr-2 size-4" />
            Board of Advisers
          </Button>
          <Button
            variant="outline"
            onClick={() => void refresh(true)}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`mr-2 size-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh prices
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {hasPortfolioOverview && (
        <PortfolioSummary
          summary={summary}
          holdingsCount={holdings.length}
          quotedCount={quotedCount}
          onCashUpdated={() => void loadPortfolioMeta()}
        />
      )}

      <AddStockForm onAdded={() => void refresh(false)} />

      <AnalyzeStockBar onAnalyze={(symbol) => openAnalysis(symbol)} />

      <WatchlistPanel
        onAnalyze={(symbol) => openAnalysis(symbol)}
        refreshToken={watchlistRefreshToken}
      />

      {holdings.length > 0 && (
        <PortfolioCategoryPie
          holdings={enrichedHoldings}
          eurUsdRate={eurUsdRate}
          metadataBySymbol={categoryMeta}
        />
      )}

      <PortfolioBubbleChart
        bubbles={bubbles}
        onAnalyze={(symbol) => openAnalysis(symbol)}
      />

      <HoldingsTable
        holdings={enrichedHoldings}
        eurUsdRate={eurUsdRate}
        metadataBySymbol={categoryMeta}
        onChanged={() => void refresh(false)}
        onAnalyze={(holding) => openAnalysis(holding.symbol, holding)}
      />

      <TransactionHistory
        transactions={transactions}
        onChanged={() => void refresh(false)}
      />

      <StockAnalysisPanel
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        symbol={analysisSymbol}
        holding={analysisHolding}
      />

      <MarketBoardPanel open={boardOpen} onOpenChange={setBoardOpen} />

      <OpportunityScannerPanel
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onAnalyze={(symbol) => openAnalysis(symbol)}
        onWatchlistChange={() =>
          setWatchlistRefreshToken((token) => token + 1)
        }
      />
    </div>
  );
}
