"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Eye, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPercent } from "@/lib/portfolio";
import type {
  AssetType,
  PortfolioCurrency,
  QuotesMap,
  WatchlistItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type WatchlistPanelProps = {
  onAnalyze: (symbol: string) => void;
  refreshToken?: number;
};

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "commodity", label: "Commodity" },
  { value: "etc", label: "ETC" },
];

function quoteKey(item: WatchlistItem): string {
  return (item.quoteSymbol ?? item.symbol).trim().toUpperCase();
}

function formatPrice(value: number, currency: string): string {
  const normalized: PortfolioCurrency = currency === "EUR" ? "EUR" : "USD";
  const locale = normalized === "EUR" ? "de-DE" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalized,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function TargetDistance({
  targetPrice,
  livePrice,
  currency,
}: {
  targetPrice: number | null;
  livePrice: number | null;
  currency: string;
}) {
  if (targetPrice === null) {
    return <span className="text-xs text-muted-foreground">No target</span>;
  }

  if (livePrice === null) {
    return (
      <span className="text-xs text-muted-foreground">
        Target {formatPrice(targetPrice, currency)}
      </span>
    );
  }

  const diffPct = ((livePrice - targetPrice) / targetPrice) * 100;
  const atOrBelow = diffPct <= 0;

  return (
    <div className="text-xs">
      <span className="text-muted-foreground">
        Target {formatPrice(targetPrice, currency)}
      </span>
      <span
        className={cn(
          "ml-1 font-medium",
          atOrBelow ? "text-green-500" : "text-amber-400",
        )}
      >
        {atOrBelow
          ? `· entry zone (${formatPercent(diffPct)})`
          : `· ${diffPct.toFixed(1)}% above`}
      </span>
    </div>
  );
}

export function WatchlistPanel({ onAnalyze, refreshToken = 0 }: WatchlistPanelProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<QuotesMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [symbol, setSymbol] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [targetPrice, setTargetPrice] = useState("");
  const [note, setNote] = useState("");
  const isInitialLoad = useRef(true);

  const loadQuotes = useCallback(async (list: WatchlistItem[]) => {
    if (list.length === 0) {
      setQuotes({});
      return;
    }
    const symbols = [...new Set(list.map(quoteKey))];
    const response = await fetch(
      `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
    );
    if (response.ok) {
      setQuotes((await response.json()) as QuotesMap);
    }
  }, []);

  const loadItems = useCallback(async () => {
    const response = await fetch("/api/watchlist");
    if (!response.ok) throw new Error("Failed to load watchlist");
    const data = (await response.json()) as WatchlistItem[];
    setItems(data);
    await loadQuotes(data);
  }, [loadQuotes]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (isInitialLoad.current) {
        setIsLoading(true);
      }
      try {
        await loadItems();
      } catch {
        if (!cancelled) toast.error("Failed to load watchlist");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          isInitialLoad.current = false;
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [loadItems, refreshToken]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          assetType,
          targetPrice: targetPrice || undefined,
          note: note || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to add to watchlist");
      }
      toast.success(
        response.status === 201
          ? `${data.symbol} added to watchlist`
          : `${data.symbol} watchlist entry updated`,
      );
      setSymbol("");
      setTargetPrice("");
      setNote("");
      await loadItems();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add to watchlist",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(item: WatchlistItem) {
    try {
      const response = await fetch(`/api/watchlist/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to remove");
      toast.success(`${item.symbol} removed from watchlist`);
      await loadItems();
    } catch {
      toast.error("Failed to remove watchlist item");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="size-4 text-primary" />
          Watchlist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleAdd}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div className="space-y-2">
            <Label htmlFor="wl-type">Type</Label>
            <select
              id="wl-type"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {ASSET_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-symbol">Symbol</Label>
            <Input
              id="wl-symbol"
              placeholder="NVDA"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-target">Target entry (optional)</Label>
            <Input
              id="wl-target"
              type="number"
              min="0"
              step="any"
              placeholder="120.00"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-note">Note (optional)</Label>
            <Input
              id="wl-note"
              placeholder="Wait for pullback"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add to watchlist"}
            </Button>
          </div>
        </form>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading watchlist...
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            <Eye className="size-5" />
            <p>Nothing on your watchlist yet.</p>
            <p className="text-xs">
              Add stocks with potential and set a target entry price to know when
              the time is right.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const quote = quotes[quoteKey(item)];
              const livePrice = quote?.price ?? null;
              const currency = quote?.currency ?? "USD";
              const dayChange = quote?.changePercent ?? null;

              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-[8rem] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{item.symbol}</span>
                      {item.companyName && (
                        <span className="truncate text-xs text-muted-foreground">
                          {item.companyName}
                        </span>
                      )}
                    </div>
                    {item.note && (
                      <p className="mt-0.5 text-xs italic text-muted-foreground">
                        “{item.note}”
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {livePrice !== null ? formatPrice(livePrice, currency) : "—"}
                    </p>
                    {dayChange !== null && (
                      <p
                        className={cn(
                          "text-xs font-medium",
                          dayChange > 0
                            ? "text-green-500"
                            : dayChange < 0
                              ? "text-red-500"
                              : "text-muted-foreground",
                        )}
                      >
                        {formatPercent(dayChange)}
                      </p>
                    )}
                  </div>

                  <div className="min-w-[10rem]">
                    <TargetDistance
                      targetPrice={item.targetPrice}
                      livePrice={livePrice}
                      currency={currency}
                    />
                  </div>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onAnalyze(item.symbol)}
                      aria-label={`Analyze ${item.symbol}`}
                    >
                      <Brain className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(item)}
                      aria-label={`Remove ${item.symbol}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
