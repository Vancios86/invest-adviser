"use client";

import { useState } from "react";
import { Brain, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCurrency,
  formatPercent,
} from "@/lib/portfolio";
import type { AssetType, HoldingWithQuote, PortfolioCurrency } from "@/lib/types";
import { cn } from "@/lib/utils";
import { convertAmount } from "@/lib/currency-utils";

const CURRENCY_OPTIONS: { value: PortfolioCurrency; label: string }[] = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
];

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "Stock",
  commodity: "Commodity",
  etc: "ETC",
  etf: "ETF",
};

type HoldingsTableProps = {
  holdings: HoldingWithQuote[];
  eurUsdRate: number | null;
  onChanged: () => void;
  onAnalyze: (holding: HoldingWithQuote) => void;
};

export function HoldingsTable({
  holdings,
  eurUsdRate,
  onChanged,
  onAnalyze,
}: HoldingsTableProps) {
  const [editing, setEditing] = useState<HoldingWithQuote | null>(null);
  const [symbol, setSymbol] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [purchaseCurrency, setPurchaseCurrency] =
    useState<PortfolioCurrency>("USD");
  const [shares, setShares] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedHoldings = [...holdings].sort((a, b) => {
    const aWeight = a.portfolioWeight;
    const bWeight = b.portfolioWeight;

    if (aWeight === null && bWeight === null) return a.symbol.localeCompare(b.symbol);
    if (aWeight === null) return 1;
    if (bWeight === null) return -1;

    if (bWeight !== aWeight) return bWeight - aWeight;
    return a.symbol.localeCompare(b.symbol);
  });

  function shouldForceEur(holding: HoldingWithQuote): boolean {
    return holding.symbol.toUpperCase() === "GDX";
  }

  function displayPurchasePrice(holding: HoldingWithQuote): string {
    if (shouldForceEur(holding)) {
      return formatCurrency(
        convertAmount(
          holding.purchasePrice,
          holding.purchaseCurrency,
          "EUR",
          eurUsdRate,
        ),
        "EUR",
      );
    }

    return formatCurrency(holding.purchasePrice, holding.purchaseCurrency);
  }

  function displayLivePrice(holding: HoldingWithQuote): string {
    if (holding.livePrice === null) return "—";

    if (shouldForceEur(holding)) {
      return formatCurrency(
        convertAmount(holding.livePrice, holding.quoteCurrency, "EUR", eurUsdRate),
        "EUR",
      );
    }

    return formatCurrency(holding.livePrice, holding.quoteCurrency);
  }

  function displayCurrentValue(holding: HoldingWithQuote): string {
    if (holding.currentValue === null) return "—";

    if (shouldForceEur(holding)) {
      return formatCurrency(
        convertAmount(
          holding.currentValue,
          holding.quoteCurrency,
          "EUR",
          eurUsdRate,
        ),
        "EUR",
      );
    }

    return formatCurrency(holding.currentValue, holding.quoteCurrency);
  }

  function openEdit(holding: HoldingWithQuote) {
    setEditing(holding);
    setSymbol(holding.symbol);
    setAssetType((holding.assetType as AssetType) ?? "stock");
    setPurchaseCurrency(holding.purchaseCurrency ?? "USD");
    setShares(String(holding.shares));
    setPurchasePrice(String(holding.purchasePrice));
  }

  function closeEdit() {
    setEditing(null);
    setSymbol("");
    setAssetType("stock");
    setPurchaseCurrency("USD");
    setShares("");
    setPurchasePrice("");
  }

  async function handleSave() {
    if (!editing) return;
    setIsSaving(true);

    try {
      const response = await fetch(`/api/holdings/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          assetType,
          purchaseCurrency,
          shares: Number(shares),
          purchasePrice: Number(purchasePrice),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to update holding");
      }

      toast.success(`${data.symbol} updated`);
      closeEdit();
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update holding",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string, symbolName: string) {
    setDeletingId(id);

    try {
      const response = await fetch(`/api/holdings/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to delete holding");
      }

      toast.success(`${symbolName} removed`);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete holding",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (holdings.length === 0) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Purchase</TableHead>
                <TableHead className="text-right">Live</TableHead>
                <TableHead className="text-right">24h</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Gain/Loss</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHoldings.map((holding) => {
                const hasQuote = holding.livePrice !== null;

                return (
                  <TableRow key={holding.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{holding.symbol}</span>
                        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {ASSET_TYPE_LABELS[(holding.assetType as AssetType) ?? "stock"]}
                        </span>
                      </div>
                      {holding.companyName && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {holding.companyName}
                        </div>
                      )}
                      {holding.quoteSymbol &&
                        holding.quoteSymbol !== holding.symbol && (
                          <div className="text-[11px] font-normal text-muted-foreground/80">
                            Quote: {holding.quoteSymbol}
                          </div>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.shares}
                    </TableCell>
                    <TableCell className="text-right">
                      {displayPurchasePrice(holding)}
                    </TableCell>
                    <TableCell className="text-right">
                      {displayLivePrice(holding)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium",
                        !hasQuote && "text-muted-foreground",
                        holding.dayChangePct !== null &&
                          (holding.dayChangePct >= 0
                            ? "text-green-500"
                            : "text-red-500"),
                      )}
                    >
                      {holding.dayChangePct !== null
                        ? formatPercent(holding.dayChangePct)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {displayCurrentValue(holding)}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.portfolioWeight !== null
                        ? `${holding.portfolioWeight.toFixed(1)}%`
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium",
                        !hasQuote && "text-muted-foreground",
                        hasQuote &&
                          (holding.isPositive
                            ? "text-green-500"
                            : "text-red-500"),
                      )}
                    >
                      {holding.gainLossPct !== null
                        ? formatPercent(holding.gainLossPct)
                        : "No quote"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onAnalyze(holding)}
                          aria-label={`Analyze ${holding.symbol}`}
                        >
                          <Brain className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(holding)}
                          aria-label={`Edit ${holding.symbol}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            handleDelete(holding.id, holding.symbol)
                          }
                          disabled={deletingId === holding.id}
                          aria-label={`Delete ${holding.symbol}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit holding</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-assetType">Type</Label>
              <select
                id="edit-assetType"
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as AssetType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-symbol">Symbol</Label>
              <Input
                id="edit-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-purchaseCurrency">Currency</Label>
              <select
                id="edit-purchaseCurrency"
                value={purchaseCurrency}
                onChange={(e) =>
                  setPurchaseCurrency(e.target.value as PortfolioCurrency)
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-shares">Shares</Label>
              <Input
                id="edit-shares"
                type="number"
                min="0"
                step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-purchasePrice">Purchase price</Label>
              <Input
                id="edit-purchasePrice"
                type="number"
                min="0"
                step="any"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
