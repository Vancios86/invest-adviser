import { convertAmount, PORTFOLIO_BASE_CURRENCY } from "@/lib/currency-utils";
import { db } from "@/lib/db";
import type { PortfolioCurrency } from "@/lib/types";

export type CashBalances = {
  cashUsd: number;
  cashEur: number;
};

export async function getCashBalances(): Promise<CashBalances> {
  const settings = await db.portfolioSettings.findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    const created = await db.portfolioSettings.create({
      data: { id: "default" },
    });
    return { cashUsd: created.cashUsd, cashEur: created.cashEur };
  }

  return { cashUsd: settings.cashUsd, cashEur: settings.cashEur };
}

export async function updateCashBalances(
  balances: Partial<CashBalances>,
): Promise<CashBalances> {
  const cashUsd =
    balances.cashUsd !== undefined ? Math.max(0, balances.cashUsd) : undefined;
  const cashEur =
    balances.cashEur !== undefined ? Math.max(0, balances.cashEur) : undefined;

  const settings = await db.portfolioSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      cashUsd: cashUsd ?? 0,
      cashEur: cashEur ?? 0,
    },
    update: {
      ...(cashUsd !== undefined ? { cashUsd } : {}),
      ...(cashEur !== undefined ? { cashEur } : {}),
    },
  });

  return { cashUsd: settings.cashUsd, cashEur: settings.cashEur };
}

export async function addCashProceeds(
  amount: number,
  currency: PortfolioCurrency,
): Promise<CashBalances> {
  const current = await getCashBalances();

  if (currency === "EUR") {
    return updateCashBalances({ cashEur: current.cashEur + amount });
  }

  return updateCashBalances({ cashUsd: current.cashUsd + amount });
}

export function computeAvailableCash(
  balances: CashBalances,
  eurUsdRate: number | null,
  targetCurrency: PortfolioCurrency = PORTFOLIO_BASE_CURRENCY,
): number {
  const usdInTarget = convertAmount(
    balances.cashUsd,
    "USD",
    targetCurrency,
    eurUsdRate,
  );
  const eurInTarget = convertAmount(
    balances.cashEur,
    "EUR",
    targetCurrency,
    eurUsdRate,
  );
  return usdInTarget + eurInTarget;
}
