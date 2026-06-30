"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  TimingPillar,
  TimingPillarVerdict,
  WatchlistTimingEntry,
  WatchlistTimingVerdict,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const TIMING_VERDICT_STYLES: Record<
  WatchlistTimingVerdict,
  { label: string; dotClass: string; badgeClass: string }
> = {
  opportunity: {
    label: "Opportunity",
    dotClass: "bg-green-500",
    badgeClass: "border-green-500/30 bg-green-500/10 text-green-500",
  },
  watch: {
    label: "Watch",
    dotClass: "bg-amber-400",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  avoid: {
    label: "Hands off",
    dotClass: "bg-red-500",
    badgeClass: "border-red-500/30 bg-red-500/10 text-red-500",
  },
};

const PILLAR_VERDICT_STYLES: Record<TimingPillarVerdict, string> = {
  bullish: "border-green-500/30 bg-green-500/10 text-green-500",
  bearish: "border-red-500/30 bg-red-500/10 text-red-500",
  neutral: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  insufficient: "border-muted bg-muted/30 text-muted-foreground",
};

function fmtPrice(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PillarBadge({ pillar }: { pillar: TimingPillar }) {
  return (
    <div
      className="rounded-md border bg-muted/10 px-2 py-1.5"
      title={pillar.summary}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            PILLAR_VERDICT_STYLES[pillar.verdict],
          )}
        >
          {pillar.verdict === "insufficient" ? "n/a" : pillar.verdict.slice(0, 4)}
        </span>
        <span className="text-[11px] font-medium">{pillar.label}</span>
      </div>
      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
        {pillar.summary}
      </p>
    </div>
  );
}

type TimingAnalysisCardProps = {
  entry: WatchlistTimingEntry;
  variant?: "list" | "inline";
  title?: string;
};

export function TimingAnalysisCard({
  entry,
  variant = "list",
  title = "Entry timing",
}: TimingAnalysisCardProps) {
  const style = TIMING_VERDICT_STYLES[entry.verdict];

  const content = (
    <div className="space-y-3">
      {variant === "list" ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn("size-2.5 shrink-0 rounded-full", style.dotClass)}
                aria-hidden="true"
              />
              <p className="font-semibold">{entry.symbol}</p>
              {entry.sources.map((source) => (
                <span
                  key={source}
                  className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {source === "holding" ? "Portfolio" : "Watchlist"}
                </span>
              ))}
              {entry.companyName && (
                <span className="truncate text-xs text-muted-foreground">
                  {entry.companyName}
                </span>
              )}
            </div>
            {entry.quoteSymbol !== entry.symbol && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                Quote: {entry.quoteSymbol}
              </p>
            )}
          </div>
          <TimingVerdictSummary entry={entry} style={style} />
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn("size-2.5 shrink-0 rounded-full", style.dotClass)}
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-muted-foreground">
              Three-pillar timing check
            </p>
          </div>
          <TimingVerdictSummary entry={entry} style={style} />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {entry.pillars.map((pillar) => (
          <PillarBadge key={pillar.id} pillar={pillar} />
        ))}
      </div>

      {entry.notes.length > 0 && (
        <ul className="space-y-0.5 text-xs text-amber-500/90">
          {entry.notes.map((note) => (
            <li key={note}>⚠ {note}</li>
          ))}
        </ul>
      )}
    </div>
  );

  if (variant === "inline") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">{content}</CardContent>
    </Card>
  );
}

function TimingVerdictSummary({
  entry,
  style,
}: {
  entry: WatchlistTimingEntry;
  style: (typeof TIMING_VERDICT_STYLES)[WatchlistTimingVerdict];
}) {
  return (
    <div className="text-right">
      <span
        className={cn(
          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
          style.badgeClass,
        )}
      >
        {style.label}
      </span>
      <p className="mt-1 text-sm font-medium">{fmtPrice(entry.livePrice)}</p>
      {entry.targetPrice !== null && (
        <p className="text-xs text-muted-foreground">
          Target {fmtPrice(entry.targetPrice)}
        </p>
      )}
    </div>
  );
}
