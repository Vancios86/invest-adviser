"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Brain,
  ExternalLink,
  Loader2,
  RefreshCw,
  Telescope,
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
  CatalystSummary,
  HealthCheck,
  MarketRegime,
  OpportunityScanReport,
  Recommendation,
  StockOpportunity,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const REGIME_META: Record<
  MarketRegime,
  { label: string; className: string; note: string }
> = {
  risk_on: {
    label: "Risk-On",
    className: "border-green-500/30 bg-green-500/10 text-green-500",
    note: "Long-leaning ideas are boosted.",
  },
  risk_off: {
    label: "Risk-Off",
    className: "border-red-500/30 bg-red-500/10 text-red-500",
    note: "Long-leaning ideas are discounted.",
  },
  mixed: {
    label: "Mixed",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    note: "No regime adjustment applied.",
  },
};

type OpportunityScannerPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnalyze: (symbol: string) => void;
};

const RECOMMENDATION_STYLES: Record<
  Recommendation,
  { label: string; className: string }
> = {
  buy: { label: "Buy", className: "bg-green-500/15 text-green-500 border-green-500/30" },
  hold: { label: "Hold", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  sell: { label: "Sell", className: "bg-red-500/15 text-red-500 border-red-500/30" },
  watch: { label: "Watch", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const HEALTH_STYLES: Record<HealthCheck["rating"], string> = {
  strong: "text-green-500",
  moderate: "text-amber-400",
  weak: "text-red-500",
};

const SOURCE_LABELS: Record<string, string> = {
  most_actives: "Most active",
  day_gainers: "Top gainer",
  day_losers: "Top loser",
};

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function changeClass(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-green-500";
  if (value < 0) return "text-red-500";
  return "text-muted-foreground";
}

function fmtVolume(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function CatalystLine({ catalyst }: { catalyst: CatalystSummary }) {
  if (!catalyst.hasCatalyst) {
    return (
      <p className="text-xs text-muted-foreground">
        No recent headlines found — volume spike lacks an obvious news catalyst.
      </p>
    );
  }

  const sentimentClass =
    catalyst.overallSentiment === "positive"
      ? "text-green-500"
      : catalyst.overallSentiment === "negative"
        ? "text-red-500"
        : "text-muted-foreground";

  return (
    <div className="space-y-1">
      <p className="text-xs">
        News flow:{" "}
        <span className={cn("font-medium capitalize", sentimentClass)}>
          {catalyst.overallSentiment}
        </span>{" "}
        <span className="text-muted-foreground">
          ({catalyst.positiveCount}+ / {catalyst.negativeCount}- /{" "}
          {catalyst.neutralCount}·)
        </span>
      </p>
      {catalyst.headlines[0] && (
        <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
          <span>“{catalyst.headlines[0].title}”</span>
          {catalyst.headlines[0].url && (
            <a
              href={catalyst.headlines[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({
  opportunity,
  rank,
  onAnalyze,
}: {
  opportunity: StockOpportunity;
  rank: number;
  onAnalyze: (symbol: string) => void;
}) {
  const { candidate, catalyst, health, verdict } = opportunity;
  const recStyle = RECOMMENDATION_STYLES[verdict.recommendation];

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {rank}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{candidate.symbol}</p>
                {candidate.sources.map((source) => (
                  <span
                    key={source}
                    className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    {SOURCE_LABELS[source] ?? source}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {candidate.companyName ?? candidate.symbol}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              {candidate.price !== null
                ? candidate.price.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </p>
            <p className={cn("text-xs font-medium", changeClass(candidate.changePercent))}>
              {fmtPct(candidate.changePercent)}
            </p>
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs sm:grid-cols-3">
          <div className="flex items-center gap-1.5">
            <Activity className="size-3.5 text-primary" />
            <span className="font-medium">
              {candidate.relativeVolume !== null
                ? `${candidate.relativeVolume.toFixed(1)}x volume`
                : "—"}
            </span>
          </div>
          <div className="text-muted-foreground">
            Vol {fmtVolume(candidate.volume)} / avg{" "}
            {fmtVolume(candidate.averageVolume)}
          </div>
          <div className="sm:text-right">
            <span className="text-muted-foreground">Opportunity </span>
            <span className="font-semibold">{opportunity.opportunityScore}</span>
            <span className="text-muted-foreground">/100</span>
            {opportunity.regimeAdjustment !== 0 && (
              <span
                className={cn(
                  "ml-1",
                  opportunity.regimeAdjustment > 0
                    ? "text-green-500"
                    : "text-red-500",
                )}
              >
                ({opportunity.regimeAdjustment > 0 ? "+" : ""}
                {opportunity.regimeAdjustment} regime)
              </span>
            )}
          </div>
        </div>

        <CatalystLine catalyst={catalyst} />

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-muted-foreground">Health:</span>
          <span className={cn("font-medium capitalize", HEALTH_STYLES[health.rating])}>
            {health.rating} ({health.score}/100)
          </span>
          {health.positives[0] && (
            <span className="text-muted-foreground">· {health.positives[0]}</span>
          )}
          {health.negatives[0] && (
            <span className="text-amber-500/90">· {health.negatives[0]}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                recStyle.className,
              )}
            >
              {recStyle.label} · {(verdict.confidence * 100).toFixed(0)}%
            </span>
            <span className="text-xs text-muted-foreground">
              {verdict.bullishCount} bullish / {verdict.bearishCount} bearish
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAnalyze(candidate.symbol)}
          >
            <Brain className="mr-2 size-4" />
            Full analysis
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {verdict.summary}
        </p>
      </CardContent>
    </Card>
  );
}

export function OpportunityScannerPanel({
  open,
  onOpenChange,
  onAnalyze,
}: OpportunityScannerPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<OpportunityScanReport | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  function reload() {
    setReport(null);
    setReloadToken((token) => token + 1);
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function scan() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/scanner", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to run the opportunity scan");
        }
        if (!cancelled) setReport(data as OpportunityScanReport);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to run the scan",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void scan();

    return () => {
      cancelled = true;
    };
  }, [open, reloadToken]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Telescope className="size-5 text-primary" />
            Opportunity Scanner
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Scans the market for unusual trading volume, checks the news for a
          catalyst and the company&apos;s fundamental health, then asks the
          committee for a verdict.
        </p>

        {isLoading && !report && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>Scanning for volume spikes...</span>
            <span className="text-xs">
              Screening the market, then running the committee on the strongest
              candidates
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

        {report && !error && (
          <div
            className={cn("space-y-4", isLoading && "pointer-events-none opacity-60")}
          >
            {isLoading && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Refreshing scan...
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {report.analyzedCount} opportunit
                {report.analyzedCount === 1 ? "y" : "ies"} from{" "}
                {report.universeSize} screened ·{" "}
                {report.minRelativeVolume.toFixed(1)}x+ relative volume
                {" · "}updated{" "}
                {new Date(report.scannedAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <Button variant="outline" size="sm" onClick={reload} disabled={isLoading}>
                <RefreshCw
                  className={cn("mr-2 size-4", isLoading && "animate-spin")}
                />
                Rescan
              </Button>
            </div>

            <div
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs",
                REGIME_META[report.marketRegime].className,
              )}
            >
              <span className="font-semibold">
                Market regime: {REGIME_META[report.marketRegime].label}
                {report.marketRegimeConfidence > 0
                  ? ` (${(report.marketRegimeConfidence * 100).toFixed(0)}%)`
                  : ""}
              </span>
              <span className="opacity-80">
                {REGIME_META[report.marketRegime].note}
              </span>
            </div>

            {report.opportunities.length === 0 ? (
              <div className="rounded-lg border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                No stocks currently show unusual volume above the threshold.
                Try again later or lower the bar.
              </div>
            ) : (
              <div className="space-y-3">
                {report.opportunities.map((opportunity, index) => (
                  <OpportunityCard
                    key={opportunity.candidate.symbol}
                    opportunity={opportunity}
                    rank={index + 1}
                    onAnalyze={(symbol) => {
                      onOpenChange(false);
                      onAnalyze(symbol);
                    }}
                  />
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">{report.disclaimer}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
