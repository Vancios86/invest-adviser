import type { PortfolioCurrency } from "@/lib/types";

export const SUPPORTED_CURRENCIES: PortfolioCurrency[] = ["USD", "EUR"];

export const PORTFOLIO_BASE_CURRENCY: PortfolioCurrency = "EUR";

export function parsePurchaseCurrency(value: unknown): PortfolioCurrency {
  const normalized = String(value ?? "USD").toUpperCase();
  if (normalized === "EUR") return "EUR";
  return "USD";
}

export function defaultPurchaseCurrency(
  assetType: string,
  quoteCurrency?: string | null,
): PortfolioCurrency {
  if (quoteCurrency === "EUR") return "EUR";
  if (assetType === "commodity" || assetType === "etc") return "EUR";
  return "USD";
}

export function convertAmount(
  amount: number,
  from: string,
  to: PortfolioCurrency,
  eurUsdRate: number | null,
): number {
  if (from === to) return amount;
  if (eurUsdRate === null || eurUsdRate <= 0) return amount;

  if (from === "EUR" && to === "USD") return amount * eurUsdRate;
  if (from === "USD" && to === "EUR") return amount / eurUsdRate;
  return amount;
}
