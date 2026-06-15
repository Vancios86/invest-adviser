"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AddStockFormProps = {
  onAdded: () => void;
};

export function AddStockForm({ onAdded }: AddStockFormProps) {
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          shares: Number(shares),
          purchasePrice: Number(purchasePrice),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to add stock");
      }

      toast.success(`${data.symbol} added to portfolio`);
      setSymbol("");
      setShares("");
      setPurchasePrice("");
      onAdded();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add stock",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Stock</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="space-y-2">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              placeholder="AAPL"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shares">Shares</Label>
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
              placeholder="150.00"
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
