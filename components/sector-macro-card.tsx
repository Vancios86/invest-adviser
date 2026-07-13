"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SectorFlowSignal, SectorMacroSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

const FLOW_STYLES: Record<
  SectorFlowSignal,
  { label: string; dotClass: string; badgeClass: string }
> = {
  accumulation: {
    label: "Inflow",
    dotClass: "bg-green-500",
    badgeClass: "border-green-500/30 bg-green-500/10 text-green-500",
  },
  distribution: {
    label: "Outflow",
    dotClass: "bg-red-500",
    badgeClass: "border-red-500/30 bg-red-500/10 text-red-500",
  },
  neutral: {
    label: "Neutral",
    dotClass: "bg-muted-foreground",
    badgeClass: "border-muted bg-muted/30 text-muted-foreground",
  },
};

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function fmtRelativeVolume(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}x avg`;
}

function FlowIcon({ signal }: { signal: SectorFlowSignal }) {
  if (signal === "accumulation") {
    return <TrendingUp className="size-4 text-green-500" />;
  }
  if (signal === "distribution") {
    return <TrendingDown className="size-4 text-red-500" />;
  }
  return null;
}

function Metric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium", valueClassName)}>{value}</p>
    </div>
  );
}

type SectorMacroCardProps = {
  snapshot: SectorMacroSnapshot;
  title?: string;
};

export function SectorMacroCard({
  snapshot,
  title = "Sector macro & flow",
}: SectorMacroCardProps) {
  const style = FLOW_STYLES[snapshot.flowSignal];
  const changeClass =
    snapshot.changePercent === null
      ? "text-muted-foreground"
      : snapshot.changePercent > 0
        ? "text-green-500"
        : snapshot.changePercent < 0
          ? "text-red-500"
          : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={cn("size-2.5 shrink-0 rounded-full", style.dotClass)}
                aria-hidden="true"
              />
              <FlowIcon signal={snapshot.flowSignal} />
              <p className="text-sm font-semibold">{snapshot.headline}</p>
            </div>
            {snapshot.matchedSector && (
              <p className="text-xs text-muted-foreground">
                {snapshot.companySector && snapshot.companySector !== snapshot.matchedSector
                  ? `Yahoo sector: ${snapshot.companySector} · Proxy: ${snapshot.matchedSector}`
                  : snapshot.matchedSector}
                {snapshot.etfSymbol ? ` (${snapshot.etfSymbol})` : ""}
                {snapshot.cyclical !== null
                  ? ` · ${snapshot.cyclical ? "Cyclical" : "Defensive"}`
                  : ""}
              </p>
            )}
          </div>
          <span
            className={cn(
              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              style.badgeClass,
            )}
          >
            {style.label}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {snapshot.summary}
        </p>

        {snapshot.etfSymbol && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Sector ETF today"
              value={fmtPct(snapshot.changePercent)}
              valueClassName={changeClass}
            />
            <Metric
              label="Relative volume"
              value={fmtRelativeVolume(snapshot.relativeVolume)}
            />
            <Metric
              label="Sector rank"
              value={
                snapshot.sectorRank !== null
                  ? `#${snapshot.sectorRank} of ${snapshot.sectorsTotal}`
                  : "—"
              }
            />
          </div>
        )}

        {snapshot.rotationNote && (
          <p className="rounded-lg border border-dashed bg-muted/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Market rotation: </span>
            {snapshot.rotationNote}
          </p>
        )}

        <p className="text-[11px] leading-snug text-muted-foreground/80">
          {snapshot.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}
