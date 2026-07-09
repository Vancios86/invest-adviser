"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AnalyzeStockBarProps = {
  onAnalyze: (symbol: string) => void;
};

export function AnalyzeStockBar({ onAnalyze }: AnalyzeStockBarProps) {
  const [query, setQuery] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();

    if (!trimmed) {
      toast.error("Enter a ticker or company name");
      return;
    }

    onAnalyze(trimmed);
    setQuery("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analyze any stock</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="NVDA or NVIDIA, Apple, ASML..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Ticker or company name to analyze"
          />
          <Button type="submit">
            <Brain className="mr-2 size-4" />
            Run analysis
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Runs the full multi-agent committee on any symbol — use a ticker or
          company name.
        </p>
      </CardContent>
    </Card>
  );
}
