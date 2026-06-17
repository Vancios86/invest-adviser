"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { convertAmount, PORTFOLIO_BASE_CURRENCY } from "@/lib/currency-utils";
import {
  CATEGORY_COLORS,
  categorizeHolding,
  type IndustryCategory,
} from "@/lib/industry-categories";
import type { HoldingWithQuote } from "@/lib/types";
import { cn } from "@/lib/utils";

type CategoryMetadataMap = Record<
  string,
  { sector: string | null; industry: string | null; companyName: string | null }
>;

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function PortfolioCategoryPie({
  holdings,
  eurUsdRate,
  metadataBySymbol,
}: {
  holdings: HoldingWithQuote[];
  eurUsdRate: number | null;
  metadataBySymbol: CategoryMetadataMap;
}) {
  const breakdown = useMemo(() => {
    const totals = new Map<IndustryCategory, number>();

    for (const holding of holdings) {
      if (holding.currentValue === null) continue;
      const valueInBase = convertAmount(
        holding.currentValue,
        holding.quoteCurrency,
        PORTFOLIO_BASE_CURRENCY,
        eurUsdRate,
      );

      const meta =
        metadataBySymbol[(holding.quoteSymbol ?? holding.symbol).toUpperCase()] ??
        metadataBySymbol[holding.symbol.toUpperCase()];

      const category = categorizeHolding({
        assetType: (holding.assetType as any) ?? "stock",
        symbol: holding.symbol,
        sector: meta?.sector ?? null,
        industry: meta?.industry ?? null,
        companyName: meta?.companyName ?? holding.companyName ?? null,
      });

      totals.set(category, (totals.get(category) ?? 0) + valueInBase);
    }

    const items = [...totals.entries()]
      .map(([category, value]) => ({ category, value }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = items.reduce((sum, item) => sum + item.value, 0);
    const withPct = items.map((item) => ({
      ...item,
      pct: total > 0 ? (item.value / total) * 100 : 0,
    }));

    return { total, items: withPct };
  }, [eurUsdRate, holdings, metadataBySymbol]);

  if (breakdown.items.length === 0) return null;

  let angle = 0;
  const gradient = breakdown.items
    .map((item) => {
      const start = angle;
      const end = angle + item.pct * 3.6;
      angle = end;
      return `${CATEGORY_COLORS[item.category]} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    })
    .join(", ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocation by category</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className={cn(
            "h-44 w-44 shrink-0 rounded-full border bg-muted",
            "shadow-sm",
          )}
          style={{
            backgroundImage: `conic-gradient(${gradient})`,
          }}
          aria-label="Portfolio category allocation pie chart"
        />

        <div className="min-w-0 flex-1 space-y-2">
          {breakdown.items.map((item) => (
            <div key={item.category} className="flex items-center gap-3 text-sm">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
              />
              <span className="min-w-0 flex-1 truncate">{item.category}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatPct(item.pct)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

