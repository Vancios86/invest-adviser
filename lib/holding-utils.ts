import { convertAmount } from "@/lib/currency-utils";
import type { PortfolioCurrency } from "@/lib/types";

export function getQuoteSymbol(holding: {
  symbol: string;
  quoteSymbol?: string | null;
}): string {
  return (holding.quoteSymbol ?? holding.symbol).trim().toUpperCase();
}

export type PurchaseLot = {
  shares: number;
  purchasePrice: number;
  purchaseCurrency: PortfolioCurrency;
};

export function mergePurchaseLots(
  existing: PurchaseLot,
  addition: PurchaseLot,
  eurUsdRate: number | null,
): PurchaseLot {
  const existingCost = existing.shares * existing.purchasePrice;
  const additionCost = convertAmount(
    addition.shares * addition.purchasePrice,
    addition.purchaseCurrency,
    existing.purchaseCurrency,
    eurUsdRate,
  );
  const totalShares = existing.shares + addition.shares;

  return {
    shares: totalShares,
    purchasePrice: (existingCost + additionCost) / totalShares,
    purchaseCurrency: existing.purchaseCurrency,
  };
}
