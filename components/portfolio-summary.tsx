"use client";

import { useState } from "react";
import { Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatPercent } from "@/lib/portfolio";
import type { PortfolioSummary as PortfolioSummaryType } from "@/lib/types";
import { cn } from "@/lib/utils";

type PortfolioSummaryProps = {
  summary: PortfolioSummaryType;
  holdingsCount: number;
  quotedCount: number;
  onCashUpdated?: () => void;
};

export function PortfolioSummary({
  summary,
  holdingsCount,
  quotedCount,
  onCashUpdated,
}: PortfolioSummaryProps) {
  const isPositive = summary.gainLossAbs >= 0;
  const [cashOpen, setCashOpen] = useState(false);
  const [cashUsd, setCashUsd] = useState("");
  const [cashEur, setCashEur] = useState("");
  const [isSavingCash, setIsSavingCash] = useState(false);

  function openCashEditor() {
    setCashUsd(String(summary.cashUsd));
    setCashEur(String(summary.cashEur));
    setCashOpen(true);
  }

  async function saveCash() {
    setIsSavingCash(true);
    try {
      const response = await fetch("/api/cash", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashUsd: Number(cashUsd),
          cashEur: Number(cashEur),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to update cash");
      }
      toast.success("Available cash updated");
      setCashOpen(false);
      onCashUpdated?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update cash",
      );
    } finally {
      setIsSavingCash(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total net worth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatCurrency(summary.totalNetWorth, summary.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Portfolio value + available cash
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Starting capital{" "}
              {formatCurrency(summary.initialCapital, summary.currency)}
            </p>
          </CardContent>
        </Card>

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
            <p className="mt-1 text-xs text-muted-foreground">
              {quotedCount} of {holdingsCount} holdings priced
              {summary.hasMixedCurrencies && summary.eurUsdRate
                ? ` · USD converted at €1 = $${summary.eurUsdRate.toFixed(4)}`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Available cash
              </CardTitle>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={openCashEditor}
                aria-label="Edit available cash"
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatCurrency(summary.availableCash, summary.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCurrency(summary.cashUsd, "USD")} +{" "}
              {formatCurrency(summary.cashEur, "EUR")} · buys deduct, sells add
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Gain / loss
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-2xl font-semibold",
                isPositive ? "text-green-500" : "text-red-500",
              )}
            >
              {formatCurrency(summary.gainLossAbs, summary.currency)}
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-medium",
                isPositive ? "text-green-500" : "text-red-500",
              )}
            >
              {formatPercent(summary.gainLossPct)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              vs starting capital of{" "}
              {formatCurrency(summary.initialCapital, summary.currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={cashOpen} onOpenChange={setCashOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="size-4" />
              Available cash
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cash ready to invest. New buys deduct the purchase cost here;
            recorded sells add proceeds automatically.
          </p>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cash-usd">USD cash</Label>
              <Input
                id="cash-usd"
                type="number"
                min="0"
                step="any"
                value={cashUsd}
                onChange={(e) => setCashUsd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-eur">EUR cash</Label>
              <Input
                id="cash-eur"
                type="number"
                min="0"
                step="any"
                value={cashEur}
                onChange={(e) => setCashEur(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCash} disabled={isSavingCash}>
              {isSavingCash ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
