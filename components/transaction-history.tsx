"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/portfolio";
import type { PortfolioCurrency, TransactionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

type TransactionHistoryProps = {
  transactions: TransactionRecord[];
  onChanged?: () => void;
};

function formatTxDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function deleteConfirmMessage(tx: TransactionRecord): string {
  if (tx.type === "sell") {
    return `Delete this sell of ${tx.shares} ${tx.symbol}? Sale proceeds will be removed from cash and the shares will be added back to your portfolio.`;
  }
  return `Remove this buy record for ${tx.symbol}? Your holdings will not change — only the history entry is deleted.`;
}

export function TransactionHistory({
  transactions,
  onChanged,
}: TransactionHistoryProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(tx: TransactionRecord) {
    if (!window.confirm(deleteConfirmMessage(tx))) return;

    setDeletingId(tx.id);
    try {
      const response = await fetch(`/api/transactions/${tx.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to delete transaction");
      }

      toast.success(
        tx.type === "sell"
          ? `${tx.symbol} sell removed — cash and holdings updated`
          : `${tx.symbol} buy removed from history`,
      );
      onChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete transaction",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            Transaction history
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No transactions yet. Buys are recorded when you add holdings; sells
            when you close a position from the holdings table.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          Transaction history
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Gain / loss</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => {
              const isSell = tx.type === "sell";
              const currency = tx.currency as PortfolioCurrency;

              return (
                <TableRow key={tx.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatTxDate(tx.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                        isSell
                          ? "border-red-500/30 bg-red-500/10 text-red-500"
                          : "border-green-500/30 bg-green-500/10 text-green-500",
                      )}
                    >
                      {isSell ? (
                        <ArrowUpRight className="size-3" />
                      ) : (
                        <ArrowDownLeft className="size-3" />
                      )}
                      {tx.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{tx.symbol}</div>
                    {tx.companyName && (
                      <div className="text-xs text-muted-foreground">
                        {tx.companyName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{tx.shares}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(tx.price, currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(tx.amount, currency)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium",
                      tx.gainLossAbs === null && "text-muted-foreground",
                      tx.gainLossAbs !== null &&
                        (tx.gainLossAbs >= 0
                          ? "text-green-500"
                          : "text-red-500"),
                    )}
                  >
                    {tx.gainLossAbs !== null ? (
                      <div>
                        <div>{formatCurrency(tx.gainLossAbs, currency)}</div>
                        {tx.gainLossPct !== null && (
                          <div className="text-xs">
                            {formatPercent(tx.gainLossPct)}
                          </div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={deletingId === tx.id}
                      onClick={() => void handleDelete(tx)}
                      aria-label={`Delete ${tx.type} transaction for ${tx.symbol}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
