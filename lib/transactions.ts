import { convertAmount, parsePurchaseCurrency } from "@/lib/currency-utils";
import { subtractCashProceeds, type CashBalances } from "@/lib/cash";
import { fetchEurUsdRate } from "@/lib/currency";
import { db } from "@/lib/db";
import { mergePurchaseLots } from "@/lib/holding-utils";
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

type TransactionRow = {
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
};

async function restoreSharesFromSell(tx: TransactionRow): Promise<void> {
  const purchaseCurrency = parsePurchaseCurrency(tx.currency);
  const costPerShare =
    tx.costBasis !== null && tx.shares > 0
      ? tx.costBasis / tx.shares
      : tx.price;

  const existing = await db.holding.findFirst({
    where: { symbol: tx.symbol },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    const eurUsdRate = await fetchEurUsdRate();
    const merged = mergePurchaseLots(
      {
        shares: existing.shares,
        purchasePrice: existing.purchasePrice,
        purchaseCurrency: parsePurchaseCurrency(existing.purchaseCurrency),
      },
      {
        shares: tx.shares,
        purchasePrice: costPerShare,
        purchaseCurrency,
      },
      eurUsdRate,
    );

    await db.holding.update({
      where: { id: existing.id },
      data: {
        shares: merged.shares,
        purchasePrice: merged.purchasePrice,
        purchaseCurrency: merged.purchaseCurrency,
        quoteSymbol: existing.quoteSymbol ?? tx.quoteSymbol,
        assetType: existing.assetType ?? tx.assetType,
      },
    });
    return;
  }

  await db.holding.create({
    data: {
      symbol: tx.symbol,
      quoteSymbol: tx.quoteSymbol,
      assetType: tx.assetType,
      shares: tx.shares,
      purchasePrice: costPerShare,
      purchaseCurrency,
    },
  });
}

export type DeleteTransactionResult = {
  deleted: TransactionRecord;
  cash?: CashBalances;
  restoredHolding?: boolean;
};

export async function deleteTransaction(
  id: string,
): Promise<DeleteTransactionResult> {
  const tx = await db.transaction.findUnique({ where: { id } });
  if (!tx) {
    throw new Error("Transaction not found");
  }

  let cash: CashBalances | undefined;
  let restoredHolding = false;

  if (tx.type === "sell") {
    cash = await subtractCashProceeds(
      tx.amount,
      parsePurchaseCurrency(tx.currency),
    );
    await restoreSharesFromSell(tx);
    restoredHolding = true;
  }

  await db.transaction.delete({ where: { id } });

  return {
    deleted: serializeTransaction(tx),
    cash,
    restoredHolding,
  };
}
