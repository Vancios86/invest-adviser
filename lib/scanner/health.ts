import type { FinancialsSnapshot, HealthCheck, HealthRating } from "@/lib/types";

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function ratingFromScore(score: number): HealthRating {
  if (score >= 66) return "strong";
  if (score >= 45) return "moderate";
  return "weak";
}

/**
 * Composite fundamental health score (0-100) derived from the data we already
 * fetch for analysis. Starts neutral at 50 and adjusts on growth, profitability,
 * returns, leverage, liquidity, and the analyst consensus.
 */
export function assessHealth(financials: FinancialsSnapshot): HealthCheck {
  let score = 50;
  const positives: string[] = [];
  const negatives: string[] = [];

  if (financials.revenueGrowth !== null) {
    const pct = financials.revenueGrowth * 100;
    if (financials.revenueGrowth > 0.15) {
      score += 12;
      positives.push(`Revenue growing ${pct.toFixed(1)}% YoY`);
    } else if (financials.revenueGrowth > 0) {
      score += 4;
    } else {
      score -= 10;
      negatives.push(`Revenue declining ${pct.toFixed(1)}% YoY`);
    }
  }

  if (financials.profitMargins !== null) {
    const pct = financials.profitMargins * 100;
    if (financials.profitMargins > 0.15) {
      score += 10;
      positives.push(`Strong net margin of ${pct.toFixed(1)}%`);
    } else if (financials.profitMargins > 0) {
      score += 3;
    } else {
      score -= 12;
      negatives.push(`Unprofitable (net margin ${pct.toFixed(1)}%)`);
    }
  }

  if (financials.returnOnEquity !== null) {
    if (financials.returnOnEquity > 0.15) {
      score += 8;
      positives.push(
        `Healthy return on equity (${(financials.returnOnEquity * 100).toFixed(1)}%)`,
      );
    } else if (financials.returnOnEquity < 0) {
      score -= 6;
      negatives.push("Negative return on equity");
    }
  }

  // Yahoo reports debt/equity as a percentage (e.g. 150 = 1.5x).
  if (financials.debtToEquity !== null) {
    if (financials.debtToEquity > 200) {
      score -= 10;
      negatives.push(
        `High leverage (debt/equity ${(financials.debtToEquity / 100).toFixed(2)}x)`,
      );
    } else if (financials.debtToEquity < 80) {
      score += 6;
      positives.push("Conservative balance sheet (low debt/equity)");
    }
  }

  if (financials.currentRatio !== null) {
    if (financials.currentRatio >= 1.5) {
      score += 5;
      positives.push(
        `Solid liquidity (current ratio ${financials.currentRatio.toFixed(2)})`,
      );
    } else if (financials.currentRatio < 1) {
      score -= 6;
      negatives.push(
        `Tight liquidity (current ratio ${financials.currentRatio.toFixed(2)})`,
      );
    }
  }

  if (financials.recommendationMean !== null) {
    // 1 = Strong Buy ... 5 = Strong Sell
    if (financials.recommendationMean <= 2.5) {
      score += 7;
      positives.push(
        `Analyst consensus leans buy (${financials.recommendationMean.toFixed(1)}/5)`,
      );
    } else if (financials.recommendationMean >= 3.5) {
      score -= 6;
      negatives.push(
        `Analyst consensus cautious (${financials.recommendationMean.toFixed(1)}/5)`,
      );
    }
  }

  if (financials.trailingPE !== null && financials.trailingPE < 0) {
    score -= 4;
    negatives.push("Negative trailing earnings (no positive P/E)");
  }

  const finalScore = Math.round(clamp(score));

  return {
    score: finalScore,
    rating: ratingFromScore(finalScore),
    positives,
    negatives,
  };
}
