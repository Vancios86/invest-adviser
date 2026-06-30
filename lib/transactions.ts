import { convertAmount, parsePurchaseCurrency } from "@/lib/currency-utils";
import { db } from "@/lib/db";
import type { PortfolioCurrency, TransactionRecord, TransactionType } from "@/lib/types";

export type CreateTransactionInput = {
  type: "buy" | "sell";
  symbol: string;
  quoteSymbol?: string | null;
  assetType?: string;
  companyName?: string | null;
  shares: number;
  price: number;
  currency: PortfolioCurrency;
  costBasis?: number | null;
  gainLossAbs?: number | null;
  gainLossPct?: number | null;
};

function serializeTransaction(row: {
  id: string;
  type: string;
  symbol: string;
  quoteSymbol: string | null;
  assetType: string;
  companyName: string | null;
  shares: number;
  price: number;
  currency: string;
  amount: number;
  costBasis: number | null;
  gainLossAbs: number | null;
  gainLossPct: number | null;
  createdAt: Date;
}): TransactionRecord {
  return {
    id: row.id,
    type: row.type as TransactionType,
    symbol: row.symbol,
    quoteSymbol: row.quoteSymbol,
    assetType: row.assetType,
    companyName: row.companyName,
    shares: row.shares,
    price: row.price,
    currency: parsePurchaseCurrency(row.currency),
    amount: row.amount,
    costBasis: row.costBasis,
    gainLossAbs: row.gainLossAbs,
    gainLossPct: row.gainLossPct,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<TransactionRecord> {
  const amount = input.shares * input.price;

  const row = await db.transaction.create({
    data: {
      type: input.type,
      symbol: input.symbol,
      quoteSymbol: input.quoteSymbol ?? null,
      assetType: input.assetType ?? "stock",
      companyName: input.companyName ?? null,
      shares: input.shares,
      price: input.price,
      currency: input.currency,
      amount,
      costBasis: input.costBasis ?? null,
      gainLossAbs: input.gainLossAbs ?? null,
      gainLossPct: input.gainLossPct ?? null,
    },
  });

  return serializeTransaction(row);
}

export async function listTransactions(): Promise<TransactionRecord[]> {
  const rows = await db.transaction.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeTransaction);
}

export function computeRealizedGainLoss(
  transactions: TransactionRecord[],
  targetCurrency: PortfolioCurrency,
  eurUsdRate: number | null,
): number {
  return transactions
    .filter((tx) => tx.type === "sell" && tx.gainLossAbs !== null)
    .reduce((sum, tx) => {
      return (
        sum +
        convertAmount(tx.gainLossAbs!, tx.currency, targetCurrency, eurUsdRate)
      );
    }, 0);
}

export function computeSellCostBasis(
  sharesSold: number,
  purchasePrice: number,
  purchaseCurrency: PortfolioCurrency,
  saleCurrency: PortfolioCurrency,
  eurUsdRate: number | null,
): number {
  const costInPurchase = sharesSold * purchasePrice;
  return convertAmount(
    costInPurchase,
    purchaseCurrency,
    saleCurrency,
    eurUsdRate,
  );
}
