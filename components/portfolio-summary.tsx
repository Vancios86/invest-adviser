import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatPercent,
} from "@/lib/portfolio";
import type { PortfolioSummary as PortfolioSummaryType } from "@/lib/types";
import { cn } from "@/lib/utils";

type PortfolioSummaryProps = {
  summary: PortfolioSummaryType;
  holdingsCount: number;
  quotedCount: number;
};

export function PortfolioSummary({
  summary,
  holdingsCount,
  quotedCount,
}: PortfolioSummaryProps) {
  const isPositive = summary.totalGainLossAbs >= 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Portfolio value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            {formatCurrency(summary.totalValue, summary.currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {quotedCount} of {holdingsCount} holdings priced
            {summary.hasMixedCurrencies && summary.eurUsdRate
              ? ` · USD holdings converted at €1 = $${summary.eurUsdRate.toFixed(4)}`
              : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Cost basis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            {formatCurrency(summary.totalCostBasis, summary.currency)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total gain / loss
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className={cn(
              "text-2xl font-semibold",
              isPositive ? "text-green-500" : "text-red-500",
            )}
          >
            {formatCurrency(summary.totalGainLossAbs, summary.currency)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Return
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className={cn(
              "text-2xl font-semibold",
              isPositive ? "text-green-500" : "text-red-500",
            )}
          >
            {formatPercent(summary.totalGainLossPct)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
