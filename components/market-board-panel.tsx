"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Minus,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  MarketBoardReport,
  MarketInstrument,
  MarketRegime,
  MarketSignal,
  SectorPerformance,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type MarketBoardPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const REGIME_STYLES: Record<
  MarketRegime,
  { label: string; className: string }
> = {
  risk_on: {
    label: "Risk-On",
    className: "bg-green-500/15 text-green-500 border-green-500/30",
  },
  risk_off: {
    label: "Risk-Off",
    className: "bg-red-500/15 text-red-500 border-red-500/30",
  },
  mixed: {
    label: "Mixed / Transitional",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
};

function SignalIcon({ signal }: { signal: MarketSignal }) {
  if (signal === "risk_on") {
    return <TrendingUp className="size-4 text-green-500" />;
  }
  if (signal === "risk_off") {
    return <TrendingDown className="size-4 text-red-500" />;
  }
  return <Minus className="size-4 text-muted-foreground" />;
}

function changeClass(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-green-500";
  if (value < 0) return "text-red-500";
  return "text-muted-foreground";
}

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function fmtPrice(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function InstrumentTile({ instrument }: { instrument: MarketInstrument }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="truncate text-xs text-muted-foreground" title={instrument.name}>
        {instrument.name}
      </p>
      <p className="text-sm font-medium">{fmtPrice(instrument.price)}</p>
      <p className={cn("text-xs font-medium", changeClass(instrument.changePercent))}>
        {fmtPct(instrument.changePercent)}
      </p>
    </div>
  );
}

function flowBadge(flow: SectorPerformance["flowSignal"]) {
  if (flow === "accumulation") {
    return (
      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-500">
        Accumulation
      </span>
    );
  }
  if (flow === "distribution") {
    return (
      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-500">
        Distribution
      </span>
    );
  }
  return null;
}

export function MarketBoardPanel({ open, onOpenChange }: MarketBoardPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MarketBoardReport | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  function reload() {
    setReport(null);
    setReloadToken((token) => token + 1);
  }

  useEffect(() => {
    if (!open || report) return;

    let cancelled = false;

    async function loadBoard() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/market-board", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.error ?? "Failed to generate the market briefing",
          );
        }
        if (!cancelled) setReport(data as MarketBoardReport);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to generate the briefing",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadBoard();

    return () => {
      cancelled = true;
    };
  }, [open, report, reloadToken]);

  const regimeStyle = report ? REGIME_STYLES[report.regime] : null;
  const sortedSectors = report
    ? [...report.snapshot.sectors].sort(
        (a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0),
      )
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Board of Advisers — Market Briefing
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>Convening the board...</span>
            <span className="text-xs">
              Reading indices, sectors, money flow and news, then enriching with
              Gemini when configured
            </span>
          </div>
        )}

        {error && !isLoading && (
          <div className="space-y-3">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
            <Button variant="outline" onClick={reload}>
              <RefreshCw className="mr-2 size-4" />
              Try again
            </Button>
          </div>
        )}

        {report && !isLoading && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Market regime</p>
                {regimeStyle && (
                  <div
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
                      regimeStyle.className,
                    )}
                  >
                    {regimeStyle.label} · {(report.confidence * 100).toFixed(0)}%
                    conviction
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {report.analysisMode === "gemini" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
                    <Sparkles className="size-3" />
                    Narratives by Gemini
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={reload}>
                  <RefreshCw className="mr-2 size-4" />
                  Refresh
                </Button>
              </div>
            </div>

            {report.llmFallbackReason && (
              <p className="text-xs text-amber-500/90">
                {report.llmFallbackReason}
              </p>
            )}

            <p className="text-sm leading-relaxed">{report.executiveSummary}</p>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Indices &amp; volatility
              </h4>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {report.snapshot.indices.map((instrument) => (
                  <InstrumentTile
                    key={instrument.symbol}
                    instrument={instrument}
                  />
                ))}
                {report.snapshot.volatility && (
                  <InstrumentTile instrument={report.snapshot.volatility} />
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Rates, dollar &amp; commodities
              </h4>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {report.snapshot.macro.map((instrument) => (
                  <InstrumentTile
                    key={instrument.symbol}
                    instrument={instrument}
                  />
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Sector performance &amp; flow
              </h4>
              <div className="space-y-1.5">
                {sortedSectors.map((sector) => (
                  <div
                    key={sector.symbol}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  >
                    <span className="w-40 shrink-0 truncate text-sm">
                      {sector.sector}
                    </span>
                    <span
                      className={cn(
                        "w-16 shrink-0 text-sm font-medium",
                        changeClass(sector.changePercent),
                      )}
                    >
                      {fmtPct(sector.changePercent)}
                    </span>
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">
                      {sector.relativeVolume !== null
                        ? `${sector.relativeVolume.toFixed(1)}x vol`
                        : "—"}
                    </span>
                    <span className="ml-auto">{flowBadge(sector.flowSignal)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                The board
              </h4>
              <div className="grid gap-3">
                {report.members.map((member) => (
                  <Card key={member.role}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{member.displayName}</p>
                          <p className="text-xs capitalize text-muted-foreground">
                            {member.signal.replace("_", "-")} ·{" "}
                            {(member.confidence * 100).toFixed(0)}% confidence
                          </p>
                        </div>
                        <SignalIcon signal={member.signal} />
                      </div>
                      {member.keyPoints.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm">
                          {member.keyPoints.map((point) => (
                            <li key={point} className="text-muted-foreground">
                              • {point}
                            </li>
                          ))}
                        </ul>
                      )}
                      {member.watchItems.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm">
                          {member.watchItems.map((item) => (
                            <li key={item} className="text-amber-500/90">
                              ⚠ {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {report.snapshot.news.items.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Market headlines
                </h4>
                <div className="space-y-2">
                  {report.snapshot.news.items.slice(0, 6).map((item) => (
                    <div
                      key={`${item.title}-${item.publishedAt}`}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p>{item.title}</p>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.source} · {item.sentiment}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{report.disclaimer}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
