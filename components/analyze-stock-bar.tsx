"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SYMBOL_PATTERN = /^[A-Z0-9.\-^]{1,12}$/;

type AnalyzeStockBarProps = {
  onAnalyze: (symbol: string) => void;
};

export function AnalyzeStockBar({ onAnalyze }: AnalyzeStockBarProps) {
  const [symbol, setSymbol] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = symbol.trim().toUpperCase();

    if (!normalized || !SYMBOL_PATTERN.test(normalized)) {
      toast.error("Enter a valid ticker symbol (e.g. AAPL)");
      return;
    }

    onAnalyze(normalized);
    setSymbol("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analyze any stock</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Enter a ticker (e.g. NVDA, TSLA, ASML)"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            className="sm:max-w-xs"
            aria-label="Ticker symbol to analyze"
          />
          <Button type="submit">
            <Brain className="mr-2 size-4" />
            Run board analysis
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Runs the full multi-agent committee on any symbol — no need to own it.
        </p>
      </CardContent>
    </Card>
  );
}
