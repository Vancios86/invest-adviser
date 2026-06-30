"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  ExternalLink,
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatCurrency,
  formatPercent,
} from "@/lib/portfolio";
import type {
  AgentOutput,
  AnalysisReport,
  HoldingWithQuote,
  IndicatorSnapshot,
  Recommendation,
  StockDataBundle,
} from "@/lib/types";
import { TimingAnalysisCard } from "@/components/timing-analysis-card";
import { cn } from "@/lib/utils";

type StockAnalysisPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string | null;
  holding?: HoldingWithQuote | null;
};

type AnalysisResponse = AnalysisReport & {
  data: StockDataBundle;
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

function SignalIcon({ signal }: { signal: AgentOutput["signal"] }) {
  if (signal === "bullish") {
    return <TrendingUp className="size-4 text-green-500" />;
  }
  if (signal === "bearish") {
    return <TrendingDown className="size-4 text-red-500" />;
  }
  return <Minus className="size-4 text-muted-foreground" />;
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function formatRatio(value: number | null, asPercent = false): string {
  if (value === null) return "—";
  if (asPercent) return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(2);
}

function formatVolumePct(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(0)}% buy / ${(100 - value).toFixed(0)}% sell`;
}

function formatRelativeVolume(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}x avg`;
}

const VOLUME_SIGNAL_STYLES: Record<
  IndicatorSnapshot["volumeSignal"],
  { label: string; className: string }
> = {
  buying: {
    label: "Buying pressure",
    className: "text-green-500",
  },
  selling: {
    label: "Selling pressure",
    className: "text-red-500",
  },
  neutral: {
    label: "Balanced volume",
    className: "text-muted-foreground",
  },
};

export function StockAnalysisPanel({
  open,
  onOpenChange,
  symbol,
  holding,
}: StockAnalysisPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  useEffect(() => {
    if (!open || !symbol) {
      setResult(null);
      setError(null);
      return;
    }

    async function analyze() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol,
            holdingId: holding?.id,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Analysis failed");
        }

        setResult(data as AnalysisResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
      } finally {
        setIsLoading(false);
      }
    }

    void analyze();
  }, [open, symbol, holding?.id]);

  const recStyle = result
    ? RECOMMENDATION_STYLES[result.recommendation]
    : null;
  const volumeStyle = result
    ? VOLUME_SIGNAL_STYLES[result.data.indicators.volumeSignal]
    : null;
  const buyVolumePct = result?.data.indicators.buyVolumePct20 ?? null;
  const sellVolumePct =
    buyVolumePct !== null ? Math.max(0, 100 - buyVolumePct) : null;
  const unusualVolume = result?.data.indicators.unusualVolume ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="size-5" />
            {symbol ? `${symbol} Analysis` : "Stock Analysis"}
            {unusualVolume && (
              <span
                className="text-base font-bold leading-none text-red-500"
                title="Unusual volume detected"
                aria-label="Unusual volume detected"
              >
                !
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>Running multi-agent analysis...</span>
            <span className="text-xs">Fetching market data, then enriching with Gemini when configured</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {result && !isLoading && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {result.data.financials.companyName}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {result.data.financials.sector ?? "Unknown sector"}
                  {result.data.financials.industry
                    ? ` · ${result.data.financials.industry}`
                    : ""}
                </p>
              </div>
              {recStyle && (
                <div
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-semibold",
                    recStyle.className,
                  )}
                >
                  {recStyle.label} · {(result.confidence * 100).toFixed(0)}% conf.
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {result.analysisMode === "gemini" && (
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
                  Narratives by Gemini{result.llmModel ? ` · ${result.llmModel}` : ""}
                </span>
              )}
              {result.llmFallbackReason && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
                  Gemini unavailable — rule-based narratives used
                </span>
              )}
            </div>

            {result.companyIntro && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">About the company</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {result.companyIntro}
                  </p>
                </CardContent>
              </Card>
            )}

            {result.timing && (
              <TimingAnalysisCard entry={result.timing} variant="inline" />
            )}

            <p className="text-sm leading-relaxed">{result.executiveSummary}</p>

            {result.position && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Your position</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-4">
                  <Metric label="Shares" value={String(result.position.shares)} />
                  <Metric
                    label="Avg cost"
                    value={formatCurrency(
                      result.position.purchasePrice,
                      result.position.purchaseCurrency,
                    )}
                  />
                  <Metric
                    label="Live"
                    value={
                      result.position.livePrice !== null
                        ? formatCurrency(
                            result.position.livePrice,
                            result.position.quoteCurrency,
                          )
                        : "—"
                    }
                  />
                  <Metric
                    label="Gain/Loss"
                    value={
                      result.position.gainLossPct !== null
                        ? formatPercent(result.position.gainLossPct)
                        : "—"
                    }
                  />
                </CardContent>
              </Card>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="P/E"
                value={formatRatio(result.data.financials.trailingPE)}
              />
              <Metric
                label="Revenue growth"
                value={formatRatio(result.data.financials.revenueGrowth, true)}
              />
              <Metric
                label="RSI (14)"
                value={formatRatio(result.data.indicators.rsi14)}
              />
              <Metric
                label="30d change"
                value={
                  result.data.indicators.change30d !== null
                    ? formatPercent(result.data.indicators.change30d)
                    : "—"
                }
              />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Buying / selling volume</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {unusualVolume && (
                  <p className="flex items-center gap-2 text-sm font-medium text-red-500">
                    <span aria-hidden="true">!</span>
                    Unusual volume
                    {result.data.indicators.relativeVolume !== null
                      ? ` (${result.data.indicators.relativeVolume.toFixed(1)}x 20-day average)`
                      : ""}
                  </p>
                )}

                {volumeStyle && (
                  <p className={cn("text-sm font-medium", volumeStyle.className)}>
                    {volumeStyle.label}
                  </p>
                )}

                {buyVolumePct !== null && sellVolumePct !== null && (
                  <div className="space-y-2">
                    <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="bg-green-500/80 transition-all"
                        style={{ width: `${buyVolumePct}%` }}
                      />
                      <div
                        className="bg-red-500/80 transition-all"
                        style={{ width: `${sellVolumePct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Buy {buyVolumePct.toFixed(0)}%</span>
                      <span>Sell {sellVolumePct.toFixed(0)}%</span>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric
                    label="Buy/sell split (20d)"
                    value={formatVolumePct(result.data.indicators.buyVolumePct20)}
                  />
                  <Metric
                    label="CMF (20)"
                    value={formatRatio(result.data.indicators.cmf20)}
                  />
                  <Metric
                    label="Relative volume"
                    value={formatRelativeVolume(
                      result.data.indicators.relativeVolume,
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Agent committee
              </h4>
              <div className="grid gap-3">
                {result.agentOutputs.map((agent) => (
                  <Card key={agent.role}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{agent.displayName}</p>
                          <p className="text-xs capitalize text-muted-foreground">
                            {agent.signal} · {(agent.confidence * 100).toFixed(0)}% confidence
                          </p>
                        </div>
                        <SignalIcon signal={agent.signal} />
                      </div>
                      {agent.keyPoints.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm">
                          {agent.keyPoints.map((point) => (
                            <li key={point} className="text-muted-foreground">
                              • {point}
                            </li>
                          ))}
                        </ul>
                      )}
                      {agent.concerns.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm">
                          {agent.concerns.map((concern) => (
                            <li key={concern} className="text-amber-500/90">
                              ⚠ {concern}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {result.data.news.items.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent news
                </h4>
                <div className="space-y-2">
                  {result.data.news.items.slice(0, 5).map((item) => (
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

            <p className="text-xs text-muted-foreground">
              {result.timingDisclaimer && (
                <>
                  {result.timingDisclaimer}
                  <br />
                </>
              )}
              {result.disclaimer}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
