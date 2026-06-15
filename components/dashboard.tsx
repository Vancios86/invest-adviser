"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AddStockForm } from "@/components/add-stock-form";
import { HoldingsTable } from "@/components/holdings-table";
import { PortfolioBubbleChart } from "@/components/portfolio-bubble-chart";
import { PortfolioSummary } from "@/components/portfolio-summary";
import { Button } from "@/components/ui/button";
import {
  aggregateBySymbol,
  computePortfolioSummary,
  enrichHoldings,
} from "@/lib/portfolio";
import type { Holding } from "@/lib/generated/prisma/client";
import type { QuotesMap } from "@/lib/types";

const QUOTE_REFRESH_MS = 5 * 60 * 1000;

export function Dashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<QuotesMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuotes = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }

    const uniqueSymbols = [...new Set(symbols.map((s) => s.toUpperCase()))];
    const response = await fetch(
      `/api/quotes?symbols=${encodeURIComponent(uniqueSymbols.join(","))}`,
    );

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
  }, []);

  const loadHoldings = useCallback(async () => {
    const response = await fetch("/api/holdings");
    if (!response.ok) {
      throw new Error("Failed to load holdings");
    }

    const data = (await response.json()) as Holding[];
    setHoldings(data);
    await loadQuotes(data.map((h) => h.symbol));
  }, [loadQuotes]);

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
    () => enrichHoldings(holdings, quotes),
    [holdings, quotes],
  );

  const bubbles = useMemo(
    () => aggregateBySymbol(enrichedHoldings),
    [enrichedHoldings],
  );

  const summary = useMemo(
    () => computePortfolioSummary(enrichedHoldings),
    [enrichedHoldings],
  );

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

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {holdings.length > 0 && (
        <PortfolioSummary
          summary={summary}
          holdingsCount={holdings.length}
          quotedCount={quotedCount}
        />
      )}

      <AddStockForm onAdded={() => void refresh(false)} />

      <PortfolioBubbleChart bubbles={bubbles} />

      <HoldingsTable
        holdings={enrichedHoldings}
        onChanged={() => void refresh(false)}
      />
    </div>
  );
}
