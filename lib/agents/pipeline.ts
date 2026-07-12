import type {
  AgentOutput,
  AgentRole,
  AnalysisContext,
  AnalysisReport,
  Recommendation,
} from "@/lib/types";

export const AGENT_DEFINITIONS: Record<
  AgentRole,
  { displayName: string; department: string }
> = {
  research: {
    displayName: "Research Analyst",
    department: "Equity Research",
  },
  technical: {
    displayName: "Technical Analyst",
    department: "Market Strategy",
  },
  news: {
    displayName: "News & Sentiment Analyst",
    department: "Media Intelligence",
  },
  risk: {
    displayName: "Risk Manager",
    department: "Risk Management",
  },
  portfolio_manager: {
    displayName: "Portfolio Manager",
    department: "Portfolio Management",
  },
  compliance: {
    displayName: "Compliance Officer",
    department: "Compliance",
  },
};

export const ANALYSIS_DISCLAIMER =
  "This analysis is for informational purposes only and does not constitute financial advice. Always do your own research before making investment decisions.";

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function runResearchAnalyst(context: AnalysisContext): AgentOutput {
  const { financials } = context.data;
  let score = 0;
  const keyPoints: string[] = [];
  const concerns: string[] = [];

  if (financials.revenueGrowth !== null) {
    if (financials.revenueGrowth > 0.1) {
      score += 1;
      keyPoints.push(
        `Revenue growing ${(financials.revenueGrowth * 100).toFixed(1)}% year-over-year`,
      );
    } else if (financials.revenueGrowth < 0) {
      score -= 1;
      concerns.push("Revenue is declining year-over-year");
    }
  }

  if (financials.profitMargins !== null && financials.profitMargins > 0.15) {
    score += 0.5;
    keyPoints.push(
      `Healthy profit margins at ${(financials.profitMargins * 100).toFixed(1)}%`,
    );
  }

  if (financials.returnOnEquity !== null && financials.returnOnEquity > 0.15) {
    score += 0.5;
    keyPoints.push(
      `Strong ROE of ${(financials.returnOnEquity * 100).toFixed(1)}%`,
    );
  }

  if (financials.debtToEquity !== null && financials.debtToEquity > 2) {
    score -= 0.75;
    concerns.push(
      `Elevated debt-to-equity ratio (${financials.debtToEquity.toFixed(1)})`,
    );
  }

  if (financials.trailingPE !== null) {
    if (financials.trailingPE < 25) {
      score += 0.25;
      keyPoints.push(`P/E of ${financials.trailingPE.toFixed(1)} looks reasonable`);
    } else if (financials.trailingPE > 40) {
      score -= 0.5;
      concerns.push(`High valuation with P/E of ${financials.trailingPE.toFixed(1)}`);
    }
  }

  if (financials.targetMeanPrice && context.data.indicators.currentPrice) {
    const upside =
      ((financials.targetMeanPrice - context.data.indicators.currentPrice) /
        context.data.indicators.currentPrice) *
      100;
    if (upside > 10) {
      score += 0.5;
      keyPoints.push(
        `Analyst target implies ${upside.toFixed(1)}% upside`,
      );
    } else if (upside < -10) {
      score -= 0.5;
      concerns.push(
        `Trading above analyst target by ${Math.abs(upside).toFixed(1)}%`,
      );
    }
  }

  const signal =
    score >= 0.75 ? "bullish" : score <= -0.75 ? "bearish" : "neutral";

  return {
    role: "research",
    displayName: AGENT_DEFINITIONS.research.displayName,
    signal,
    confidence: clamp(Math.abs(score) / 2),
    keyPoints: keyPoints.slice(0, 4),
    concerns: concerns.slice(0, 3),
  };
}

function runTechnicalAnalyst(context: AnalysisContext): AgentOutput {
  const { indicators } = context.data;
  let score = 0;
  const keyPoints: string[] = [];
  const concerns: string[] = [];

  if (indicators.trend === "bullish") {
    score += 1;
    keyPoints.push("Price above rising short- and medium-term averages");
  } else if (indicators.trend === "bearish") {
    score -= 1;
    concerns.push("Price below declining moving averages");
  }

  if (indicators.rsi14 !== null) {
    if (indicators.rsi14 < 30) {
      score += 0.5;
      keyPoints.push(`RSI at ${indicators.rsi14.toFixed(0)} — potentially oversold`);
    } else if (indicators.rsi14 > 70) {
      score -= 0.5;
      concerns.push(`RSI at ${indicators.rsi14.toFixed(0)} — potentially overbought`);
    } else {
      keyPoints.push(`RSI at ${indicators.rsi14.toFixed(0)} — neutral momentum`);
    }
  }

  if (indicators.change30d !== null) {
    if (indicators.change30d > 5) {
      score += 0.25;
      keyPoints.push(`Up ${indicators.change30d.toFixed(1)}% over the last 30 days`);
    } else if (indicators.change30d < -5) {
      score -= 0.25;
      concerns.push(`Down ${Math.abs(indicators.change30d).toFixed(1)}% over 30 days`);
    }
  }

  if (
    indicators.currentPrice !== null &&
    indicators.sma200 !== null &&
    indicators.currentPrice > indicators.sma200
  ) {
    keyPoints.push("Trading above 200-day moving average");
    score += 0.25;
  } else   if (
    indicators.currentPrice !== null &&
    indicators.sma200 !== null
  ) {
    concerns.push("Trading below 200-day moving average");
    score -= 0.25;
  }

  if (indicators.buyVolumePct20 !== null) {
    if (indicators.buyVolumePct20 >= 58) {
      score += 0.5;
      keyPoints.push(
        `Buying volume dominant (${indicators.buyVolumePct20.toFixed(0)}% of 20-day volume on up days)`,
      );
    } else if (indicators.buyVolumePct20 <= 42) {
      score -= 0.5;
      concerns.push(
        `Selling volume dominant (${(100 - indicators.buyVolumePct20).toFixed(0)}% of 20-day volume on down days)`,
      );
    }
  }

  if (indicators.cmf20 !== null) {
    if (indicators.cmf20 >= 0.08) {
      score += 0.25;
      keyPoints.push(`Chaikin Money Flow positive (${indicators.cmf20.toFixed(2)})`);
    } else if (indicators.cmf20 <= -0.08) {
      score -= 0.25;
      concerns.push(`Chaikin Money Flow negative (${indicators.cmf20.toFixed(2)})`);
    }
  }

  if (indicators.unusualVolume && indicators.relativeVolume !== null) {
    const volumeMultiple = indicators.relativeVolume.toFixed(1);

    if (indicators.volumeSignal === "buying") {
      score += 0.5;
      keyPoints.push(
        `Unusual volume (${volumeMultiple}x avg) with buying pressure — strong participation`,
      );
    } else if (indicators.volumeSignal === "selling") {
      score -= 0.5;
      concerns.push(
        `Unusual volume (${volumeMultiple}x avg) with selling pressure — distribution risk`,
      );
    } else {
      score += 0.25;
      keyPoints.push(
        `Unusual volume (${volumeMultiple}x avg) — watch for a catalyst or breakout`,
      );
    }
  } else if (
    indicators.relativeVolume !== null &&
    indicators.relativeVolume >= 1.2
  ) {
    keyPoints.push(
      `Volume ${indicators.relativeVolume.toFixed(1)}x above the 20-day average`,
    );
  }

  const signal =
    score >= 0.75 ? "bullish" : score <= -0.75 ? "bearish" : "neutral";

  return {
    role: "technical",
    displayName: AGENT_DEFINITIONS.technical.displayName,
    signal,
    confidence: clamp(Math.abs(score) / 1.75),
    keyPoints: keyPoints.slice(0, 4),
    concerns: concerns.slice(0, 3),
  };
}

function runNewsAnalyst(context: AnalysisContext): AgentOutput {
  const { news } = context.data;
  let score = 0;
  const keyPoints: string[] = [];
  const concerns: string[] = [];

  if (news.positiveCount > news.negativeCount) {
    score += 0.75;
    keyPoints.push(
      `${news.positiveCount} positive vs ${news.negativeCount} negative headlines recently`,
    );
  } else if (news.negativeCount > news.positiveCount) {
    score -= 0.75;
    concerns.push(
      `${news.negativeCount} negative headlines outweigh positive coverage`,
    );
  }

  if (news.items.length === 0) {
    concerns.push("Limited recent news coverage available");
  } else {
    keyPoints.push(`${news.items.length} recent headlines analyzed`);
    if (news.items[0]) {
      keyPoints.push(`Latest: "${news.items[0].title.slice(0, 80)}..."`);
    }
  }

  const signal =
    news.overallSentiment === "positive"
      ? "bullish"
      : news.overallSentiment === "negative"
        ? "bearish"
        : "neutral";

  return {
    role: "news",
    displayName: AGENT_DEFINITIONS.news.displayName,
    signal,
    confidence: clamp(
      Math.abs(news.positiveCount - news.negativeCount) /
        Math.max(news.items.length, 1),
    ),
    keyPoints: keyPoints.slice(0, 4),
    concerns: concerns.slice(0, 3),
  };
}

function runRiskManager(context: AnalysisContext): AgentOutput {
  const { financials, indicators } = context.data;
  let score = 0;
  const keyPoints: string[] = [];
  const concerns: string[] = [];

  if (financials.beta !== null) {
    if (financials.beta > 1.3) {
      score -= 0.5;
      concerns.push(`High beta (${financials.beta.toFixed(2)}) — above-market volatility`);
    } else if (financials.beta < 0.8) {
      score += 0.25;
      keyPoints.push(`Lower beta (${financials.beta.toFixed(2)}) — defensive profile`);
    }
  }

  if (
    indicators.currentPrice !== null &&
    financials.fiftyTwoWeekHigh !== null
  ) {
    const drawdown =
      ((indicators.currentPrice - financials.fiftyTwoWeekHigh) /
        financials.fiftyTwoWeekHigh) *
      100;
    if (drawdown < -25) {
      score -= 0.5;
      concerns.push(`${Math.abs(drawdown).toFixed(0)}% below 52-week high`);
    } else if (drawdown > -5) {
      concerns.push("Trading near 52-week high — limited margin of safety");
      score -= 0.25;
    } else {
      keyPoints.push(`${Math.abs(drawdown).toFixed(0)}% below 52-week high`);
    }
  }

  if (context.position?.portfolioWeight !== null && context.position?.portfolioWeight !== undefined) {
    if (context.position.portfolioWeight > 25) {
      score -= 0.75;
      concerns.push(
        `Concentrated position at ${context.position.portfolioWeight.toFixed(1)}% of portfolio`,
      );
    } else if (context.position.portfolioWeight < 10) {
      keyPoints.push(
        `Modest position size (${context.position.portfolioWeight.toFixed(1)}% of portfolio)`,
      );
      score += 0.25;
    }
  }

  if (context.position?.gainLossPct !== null && context.position?.gainLossPct !== undefined) {
    if (context.position.gainLossPct > 50) {
      concerns.push(
        `Large unrealized gain (+${context.position.gainLossPct.toFixed(0)}%) — consider trimming`,
      );
      score -= 0.25;
    } else if (context.position.gainLossPct < -20) {
      concerns.push(
        `Significant unrealized loss (${context.position.gainLossPct.toFixed(0)}%)`,
      );
      score -= 0.25;
    }
  }

  const signal =
    score >= 0.5 ? "bullish" : score <= -0.5 ? "bearish" : "neutral";

  return {
    role: "risk",
    displayName: AGENT_DEFINITIONS.risk.displayName,
    signal,
    confidence: clamp(Math.abs(score) / 1.5),
    keyPoints: keyPoints.slice(0, 4),
    concerns: concerns.slice(0, 3),
  };
}

export const CORE_ANALYST_ROLES = [
  "research",
  "technical",
  "news",
  "risk",
] as const satisfies readonly AgentRole[];

export type CoreAnalystRole = (typeof CORE_ANALYST_ROLES)[number];

export function synthesizeRecommendation(
  agents: AgentOutput[],
  context: AnalysisContext,
): { recommendation: Recommendation; confidence: number; summary: string } {
  const weights: Record<AgentOutput["role"], number> = {
    research: 0.3,
    technical: 0.25,
    news: 0.15,
    risk: 0.2,
    portfolio_manager: 0,
    compliance: 0,
  };

  let score = 0;
  let weightSum = 0;

  for (const agent of agents) {
    const weight = weights[agent.role] ?? 0;
    if (weight === 0) continue;
    const direction =
      agent.signal === "bullish" ? 1 : agent.signal === "bearish" ? -1 : 0;
    score += direction * agent.confidence * weight;
    weightSum += weight;
  }

  const normalized = weightSum > 0 ? score / weightSum : 0;
  let recommendation: Recommendation = "hold";

  if (normalized >= 0.35) recommendation = "buy";
  else if (normalized <= -0.35) recommendation = "sell";
  else if (Math.abs(normalized) < 0.15) recommendation = "watch";

  if (
    context.position &&
    recommendation === "buy" &&
    context.position.gainLossPct !== null &&
    context.position.gainLossPct > 40
  ) {
    recommendation = "hold";
  }

  const bullish = agents.filter((a) => a.signal === "bullish").length;
  const bearish = agents.filter((a) => a.signal === "bearish").length;

  const summary = `${context.companyName} (${context.symbol}): ${bullish} bullish and ${bearish} bearish signals across research, technical, news, and risk teams. Overall stance: ${recommendation.toUpperCase()}.`;

  return {
    recommendation,
    confidence: clamp(Math.abs(normalized)),
    summary,
  };
}

export function buildPortfolioManagerOutput(
  agents: AgentOutput[],
  synthesis: ReturnType<typeof synthesizeRecommendation>,
): AgentOutput {
  return runPortfolioManager(agents, synthesis);
}

function runPortfolioManager(
  agents: AgentOutput[],
  synthesis: ReturnType<typeof synthesizeRecommendation>,
): AgentOutput {
  return {
    role: "portfolio_manager",
    displayName: AGENT_DEFINITIONS.portfolio_manager.displayName,
    signal:
      synthesis.recommendation === "buy"
        ? "bullish"
        : synthesis.recommendation === "sell"
          ? "bearish"
          : "neutral",
    confidence: synthesis.confidence,
    keyPoints: [synthesis.summary],
    concerns:
      synthesis.recommendation === "sell"
        ? ["Team consensus suggests reducing exposure"]
        : synthesis.recommendation === "watch"
          ? ["Mixed signals — monitor before acting"]
          : [],
  };
}

function runCompliance(): AgentOutput {
  return {
    role: "compliance",
    displayName: AGENT_DEFINITIONS.compliance.displayName,
    signal: "neutral",
    confidence: 1,
    keyPoints: [
      "Analysis based on publicly available market data",
      "Past performance does not guarantee future results",
    ],
    concerns: [ANALYSIS_DISCLAIMER],
  };
}

export function runAnalysisPipeline(context: AnalysisContext): AnalysisReport {
  const coreAgents = [
    runResearchAnalyst(context),
    runTechnicalAnalyst(context),
    runNewsAnalyst(context),
    runRiskManager(context),
  ];

  const synthesis = synthesizeRecommendation(coreAgents, context);
  const portfolioManager = runPortfolioManager(coreAgents, synthesis);
  const compliance = runCompliance();

  return {
    symbol: context.symbol,
    recommendation: synthesis.recommendation,
    confidence: synthesis.confidence,
    executiveSummary: synthesis.summary,
    agentOutputs: [...coreAgents, portfolioManager, compliance],
    generatedAt: new Date().toISOString(),
    position: context.position,
    disclaimer: ANALYSIS_DISCLAIMER,
  };
}
