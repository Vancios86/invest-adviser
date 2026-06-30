"use client";

import { ArrowDownLeft, ArrowUpRight, History } from "lucide-react";
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

export function TransactionHistory({
  transactions,
}: TransactionHistoryProps) {
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
