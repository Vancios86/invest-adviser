"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssetType, PortfolioCurrency } from "@/lib/types";

type AddStockFormProps = {
  onAdded: () => void;
};

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string; placeholder: string }[] =
  [
    { value: "stock", label: "Stock", placeholder: "AAPL" },
    { value: "commodity", label: "Commodity", placeholder: "4GLD" },
    { value: "etc", label: "ETC", placeholder: "8PSB" },
    { value: "etf", label: "ETF", placeholder: "GLD" },
  ];

const CURRENCY_OPTIONS: { value: PortfolioCurrency; label: string }[] = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
];

function defaultCurrencyForAssetType(assetType: AssetType): PortfolioCurrency {
  return assetType === "commodity" || assetType === "etc" ? "EUR" : "USD";
}

export function AddStockForm({ onAdded }: AddStockFormProps) {
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [purchaseCurrency, setPurchaseCurrency] =
    useState<PortfolioCurrency>("USD");
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedOption =
    ASSET_TYPE_OPTIONS.find((option) => option.value === assetType) ??
    ASSET_TYPE_OPTIONS[0];

  useEffect(() => {
    setPurchaseCurrency(defaultCurrencyForAssetType(assetType));
  }, [assetType]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/holdings", {
        method: "POST",
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
        throw new Error(data.error ?? "Failed to add holding");
      }

      toast.success(`${data.symbol} added to portfolio`);
      setSymbol("");
      setShares("");
      setPurchasePrice("");
      onAdded();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add holding",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add holding</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
        >
          <div className="space-y-2">
            <Label htmlFor="assetType">Type</Label>
            <select
              id="assetType"
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
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              placeholder={selectedOption.placeholder}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purchaseCurrency">Currency</Label>
            <select
              id="purchaseCurrency"
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
            <Label htmlFor="shares">Units</Label>
            <Input
              id="shares"
              type="number"
              min="0"
              step="any"
              placeholder="10"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purchasePrice">Purchase price</Label>
            <Input
              id="purchasePrice"
              type="number"
              min="0"
              step="any"
              placeholder={purchaseCurrency === "EUR" ? "113.70" : "150.00"}
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add to portfolio"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
