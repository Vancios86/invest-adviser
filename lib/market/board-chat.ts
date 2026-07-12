import { fetchStockData } from "@/lib/analysis-data";
import { BOARD_DEFINITIONS, BOARD_DISCLAIMER } from "@/lib/market/board";
import { fetchMarketSnapshot } from "@/lib/market/market-data";
import { getGeminiClient, getGeminiModel, isGeminiConfigured } from "@/lib/llm/gemini";
import { withGeminiRetry } from "@/lib/llm/gemini-retry";
import { isValidSymbolFormat } from "@/lib/symbols";
import type {
  BoardChatMessage,
  BoardChatResponse,
  BoardRole,
  MarketBoardReport,
  MarketRegime,
  MarketSignal,
  MarketSnapshot,
  WatchlistTimingVerdict,
} from "@/lib/types";

const TICKER_BLOCKLIST = new Set([
  "A",
  "AI",
  "ALL",
  "AND",
  "ANY",
  "ARE",
  "AT",
  "BE",
  "BIG",
  "BUY",
  "CAN",
  "CEO",
  "CFO",
  "ETF",
  "EU",
  "FED",
  "FOR",
  "GDP",
  "HAD",
  "HAS",
  "HIGH",
  "HOLD",
  "I",
  "IN",
  "IPO",
  "IS",
  "IT",
  "LOW",
  "MAY",
  "NEW",
  "NOT",
  "NOW",
  "OLD",
  "ON",
  "OR",
  "SEC",
  "SELL",
  "THE",
  "TO",
  "TOP",
  "UK",
  "US",
  "VIX",
  "WAS",
]);

const FRESH_MARKET_PATTERN =
  /\b(now|today|latest|current|right now|refresh|update|live)\b/i;

function formatPct(value: number | null, digits = 1): string {
  if (value === null) return "unavailable";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function formatPrice(value: number | null): string {
  if (value === null) return "unavailable";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function regimeLabel(regime: MarketRegime): string {
  if (regime === "risk_on") return "risk-on";
  if (regime === "risk_off") return "risk-off";
  return "mixed / transitional";
}

function signalLabel(signal: MarketSignal): string {
  if (signal === "risk_on") return "risk-on";
  if (signal === "risk_off") return "risk-off";
  return "neutral";
}

function timingVerdictLabel(verdict: WatchlistTimingVerdict): string {
  if (verdict === "opportunity") return "looks like a favorable entry";
  if (verdict === "avoid") return "best to stay on the sidelines for now";
  return "worth watching, but not a clear entry yet";
}

function pillarVerdictLabel(
  verdict: "bullish" | "bearish" | "neutral" | "insufficient",
): string {
  if (verdict === "bullish") return "supportive";
  if (verdict === "bearish") return "cautionary";
  if (verdict === "insufficient") return "not enough data";
  return "mixed";
}

function volumeSignalLabel(
  signal: "buying" | "selling" | "neutral" | null | undefined,
): string {
  if (signal === "buying") return "buying pressure";
  if (signal === "selling") return "selling pressure";
  if (signal === "neutral") return "balanced volume";
  return "unclear";
}

function flowSignalLabel(
  signal: "accumulation" | "distribution" | "neutral",
): string {
  if (signal === "accumulation") return "accumulation";
  if (signal === "distribution") return "distribution";
  return "neutral flow";
}

function extractSymbols(text: string): string[] {
  const matches =
    text.toUpperCase().match(/\b[A-Z][A-Z0-9]{0,4}(?:\.[A-Z]{1,3})?\b/g) ?? [];
  const unique = [...new Set(matches)];
  return unique
    .filter((symbol) => isValidSymbolFormat(symbol) && !TICKER_BLOCKLIST.has(symbol))
    .slice(0, 3);
}

function extractSymbolsFromMessages(messages: BoardChatMessage[]): string[] {
  const fromUser = messages
    .filter((message) => message.role === "user")
    .flatMap((message) => extractSymbols(message.content));
  return [...new Set(fromUser)].slice(0, 3);
}

function formatBoardChatDataContext(
  report: MarketBoardReport,
  snapshot: MarketSnapshot,
  symbolResearch: Awaited<ReturnType<typeof fetchSymbolResearch>>,
  refreshedMarket: boolean,
): string {
  const sections: string[] = [];

  sections.push(
    `Market briefing (generated ${formatTimestamp(report.generatedAt)}; prices as of ${formatTimestamp(snapshot.fetchedAt)}${refreshedMarket ? "; market data refreshed for this reply" : ""})`,
  );
  sections.push(
    `Overall regime: ${regimeLabel(report.regime)} with ${(report.confidence * 100).toFixed(0)}% conviction.`,
  );
  sections.push(`Executive summary: ${report.executiveSummary}`);

  sections.push("Board views:");
  for (const member of report.members) {
    const points =
      member.keyPoints.length > 0
        ? member.keyPoints.join("; ")
        : "No key points recorded.";
    const watches =
      member.watchItems.length > 0
        ? ` Watch items: ${member.watchItems.join("; ")}.`
        : "";
    sections.push(
      `- ${member.displayName}: ${signalLabel(member.signal)} stance (${(member.confidence * 100).toFixed(0)}% confidence). ${points}${watches}`,
    );
  }

  if (report.watchlistTiming.entries.length > 0) {
    sections.push("Watchlist and portfolio timing:");
    for (const entry of report.watchlistTiming.entries) {
      const pillars = entry.pillars
        .map(
          (pillar) =>
            `${pillar.label} is ${pillarVerdictLabel(pillar.verdict)} (${pillar.summary})`,
        )
        .join("; ");
      const target =
        entry.targetPrice !== null
          ? ` Target price ${formatPrice(entry.targetPrice)}.`
          : "";
      sections.push(
        `- ${entry.companyName ?? entry.symbol} (${entry.symbol}) at ${formatPrice(entry.livePrice)}: ${timingVerdictLabel(entry.verdict)}. ${pillars}.${target}`,
      );
    }
  }

  sections.push("Indices and volatility:");
  for (const instrument of snapshot.indices) {
    sections.push(
      `- ${instrument.name}: ${formatPrice(instrument.price)} (${formatPct(instrument.changePercent)})`,
    );
  }
  if (snapshot.volatility) {
    sections.push(
      `- ${snapshot.volatility.name}: ${formatPrice(snapshot.volatility.price)} (${formatPct(snapshot.volatility.changePercent)})`,
    );
  }

  sections.push("Rates, dollar, and commodities:");
  for (const instrument of snapshot.macro) {
    sections.push(
      `- ${instrument.name}: ${formatPrice(instrument.price)} (${formatPct(instrument.changePercent)})`,
    );
  }

  sections.push("Sector performance:");
  for (const sector of snapshot.sectors) {
    sections.push(
      `- ${sector.sector}: ${formatPct(sector.changePercent)}; ${sector.relativeVolume !== null ? `${sector.relativeVolume.toFixed(1)}x average volume` : "volume unavailable"}; ${flowSignalLabel(sector.flowSignal)}`,
    );
  }

  if (snapshot.news.items.length > 0) {
    sections.push("Recent headlines:");
    for (const item of snapshot.news.items.slice(0, 8)) {
      sections.push(`- ${item.title} (${item.source}, ${item.sentiment})`);
    }
  }

  if (symbolResearch.length > 0) {
    sections.push("Fresh symbol research:");
    for (const research of symbolResearch) {
      const headline =
        research.news.length > 0
          ? ` Recent news: ${research.news.map((item) => item.title).join("; ")}.`
          : "";
      sections.push(
        `- ${research.companyName} (${research.symbol})${research.sector ? `, ${research.sector}` : ""}: price ${formatPrice(research.currentPrice)}, 30-day change ${formatPct(research.change30d)}, RSI ${research.rsi14?.toFixed(1) ?? "n/a"}, ${volumeSignalLabel(research.volumeSignal)}${research.relativeVolume !== null ? ` (${research.relativeVolume.toFixed(1)}x average volume)` : ""}. Trailing P/E ${research.trailingPE?.toFixed(1) ?? "n/a"}; revenue growth ${research.revenueGrowth !== null ? formatPct(research.revenueGrowth * 100) : "n/a"}; margins ${research.profitMargins !== null ? formatPct(research.profitMargins * 100) : "n/a"}.${headline}`,
      );
    }
  }

  return sections.join("\n");
}

async function fetchSymbolResearch(symbols: string[]) {
  if (symbols.length === 0) return [];

  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const data = await fetchStockData(symbol);
      return {
        symbol: data.symbol,
        companyName: data.financials.companyName,
        sector: data.financials.sector,
        industry: data.financials.industry,
        marketCap: data.financials.marketCap,
        trailingPE: data.financials.trailingPE,
        revenueGrowth: data.financials.revenueGrowth,
        profitMargins: data.financials.profitMargins,
        currentPrice: data.indicators.currentPrice,
        change30d: data.indicators.change30d,
        rsi14: data.indicators.rsi14,
        volumeSignal: data.indicators.volumeSignal,
        relativeVolume: data.indicators.relativeVolume,
        news: data.news.items.slice(0, 3).map((item) => ({
          title: item.title,
          sentiment: item.sentiment,
          source: item.source,
        })),
      };
    }),
  );

  const results = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    }
  }
  return results;
}

function buildBoardChatSystemPrompt(memberRole?: BoardRole): string {
  const persona = memberRole
    ? `Respond primarily as the ${BOARD_DEFINITIONS[memberRole].displayName} (${BOARD_DEFINITIONS[memberRole].mandate}). Draw on your desk's lens while staying grounded in the shared data. When other desks disagree with yours, acknowledge the tension honestly rather than overstating consensus.`
    : `You are the full Board of Advisers — a panel of macro, sector rotation, flow, news, and strategy specialists helping a self-directed retail investor discuss markets and research ideas. When desks disagree, say so clearly and explain what each side is seeing.`;

  return `${persona}

${CHAT_GUARDRAILS}

${BOARD_DISCLAIMER}`;
}

const CHAT_GUARDRAILS = `Rules:
- Reply in natural, conversational English for a retail investor.
- Never expose internal codes, enum values, JSON keys, snake_case labels, desk role IDs, or backend terminology.
- Translate all data into plain language (e.g. say "risk-on environment" not "risk_on"; "favorable entry" not "opportunity"; "supportive trend" not "bullish").
- Do not mention "briefing", "snapshot", "research bundle", "symbolResearch", field names, or how data was fetched.
- Use company names alongside tickers when available.
- Ground every answer in the supplied data; do not invent prices, levels, events, analyst names, or institution names.
- When watchlist or portfolio timing data is present, connect your answer to those names when the user asks about entries or specific stocks.
- If the user asks about a symbol without fresh research data, say you need the ticker and offer to look it up.
- Be concise and practical — like a research desk conversation, not a data dump. Challenge weak theses politely when data does not support them.
- This is informational discussion, not personalized financial advice.`;

function humanizeBoardChatReply(text: string): string {
  return text
    .replace(/\brisk_on\b/gi, "risk-on")
    .replace(/\brisk_off\b/gi, "risk-off")
    .replace(/\bsector_rotation\b/g, "sector rotation")
    .replace(/\binstitutional_flow\b/g, "institutional flow")
    .replace(/\bchief_strategist\b/g, "chief strategist")
    .replace(/\bgeopolitical\b/g, "geopolitical")
    .replace(/\bsymbolResearch\b/g, "research")
    .replace(/\bbriefingGeneratedAt\b/g, "")
    .replace(/\bsnapshotFetchedAt\b/g, "");
}

export async function runBoardChat(input: {
  messages: BoardChatMessage[];
  report: MarketBoardReport;
  memberRole?: BoardRole;
}): Promise<BoardChatResponse> {
  if (!isGeminiConfigured()) {
    return {
      reply:
        "Board chat requires GEMINI_API_KEY in your environment. Add it to .env to discuss markets with the board in real time.",
      analysisMode: "rules",
    };
  }

  const client = getGeminiClient();
  if (!client) {
    return {
      reply: "Gemini is not configured. Add GEMINI_API_KEY to .env to use board chat.",
      analysisMode: "rules",
    };
  }

  const lastUserMessage =
    [...input.messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";

  const wantsFreshMarket = FRESH_MARKET_PATTERN.test(lastUserMessage);
  let refreshedMarket = false;
  let snapshot = input.report.snapshot;

  if (wantsFreshMarket) {
    try {
      snapshot = await fetchMarketSnapshot();
      refreshedMarket = true;
    } catch (error) {
      console.error("Failed to refresh market snapshot for board chat:", error);
    }
  }

  const researchSymbols = extractSymbolsFromMessages(input.messages);
  const symbolResearch = await fetchSymbolResearch(researchSymbols);

  const dataContext = formatBoardChatDataContext(
    input.report,
    snapshot,
    symbolResearch,
    refreshedMarket,
  );

  const model = getGeminiModel();
  const response = await withGeminiRetry(() =>
    client.models.generateContent({
      model,
      contents: input.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      config: {
        systemInstruction: `${buildBoardChatSystemPrompt(input.memberRole)}

Reference data for this conversation (for your reasoning only — do not quote field names or internal labels in your reply):
${dataContext}`,
        temperature: 0.55,
      },
    }),
  );

  const rawReply = response.text?.trim();
  if (!rawReply) {
    throw new Error("Empty Gemini response for board chat");
  }

  const reply = humanizeBoardChatReply(rawReply);

  return {
    reply,
    researchSymbols,
    analysisMode: "gemini",
    llmModel: model,
    refreshedMarket,
  };
}
