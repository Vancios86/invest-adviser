import { GoogleGenAI } from "@google/genai";
import { getGeminiModel, isGeminiConfigured } from "@/lib/llm/gemini";
import { getGeminiConcurrency, mapWithConcurrency, withGeminiRetry } from "@/lib/llm/gemini-retry";
import {
  BOARD_MEMBER_SCHEMA,
  BOARD_MEMBER_SYSTEM,
  BOARD_SUMMARY_SCHEMA,
  BOARD_SUMMARY_SYSTEM,
  ENRICHABLE_BOARD_ROLES,
  buildBoardMemberPayload,
  buildBoardSummaryPayload,
  type BoardMemberNarrative,
  type BoardSummaryResult,
} from "@/lib/market/board-prompts";
import type {
  BoardMemberOutput,
  BoardRole,
  MarketBoardReport,
} from "@/lib/types";

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

function parseMemberNarrative(raw: string): BoardMemberNarrative {
  const parsed = JSON.parse(raw) as BoardMemberNarrative;
  if (!Array.isArray(parsed.keyPoints) || !Array.isArray(parsed.watchItems)) {
    throw new Error("Invalid board member narrative shape");
  }
  return parsed;
}

function parseSummary(raw: string): BoardSummaryResult {
  const parsed = JSON.parse(raw) as BoardSummaryResult;
  if (typeof parsed.executiveSummary !== "string") {
    throw new Error("Invalid board summary shape");
  }
  return parsed;
}

async function enrichMember(
  client: GoogleGenAI,
  model: string,
  role: BoardRole,
  report: MarketBoardReport,
): Promise<BoardMemberOutput> {
  const baseline = report.members.find((m) => m.role === role);
  if (!baseline) throw new Error(`Missing baseline board member: ${role}`);

  const payload = buildBoardMemberPayload(role, report);

  const response = await withGeminiRetry(() =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Rewrite the ${baseline.displayName} commentary on the current market.

Fixed signal: ${baseline.signal}
Fixed confidence: ${(baseline.confidence * 100).toFixed(0)}%

Context and baseline narrative:
${payload}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: BOARD_MEMBER_SYSTEM[role],
        responseMimeType: "application/json",
        responseSchema: BOARD_MEMBER_SCHEMA,
        temperature: 0.4,
      },
    }),
  );

  const text = response.text;
  if (!text) throw new Error(`Empty Gemini response for ${role}`);

  const narrative = parseMemberNarrative(text);

  return {
    ...baseline,
    keyPoints:
      narrative.keyPoints.length > 0 ? narrative.keyPoints : baseline.keyPoints,
    watchItems:
      narrative.watchItems.length > 0
        ? narrative.watchItems
        : baseline.watchItems,
  };
}

async function enrichSummary(
  client: GoogleGenAI,
  model: string,
  report: MarketBoardReport,
  enrichedMembers: BoardMemberOutput[],
): Promise<string> {
  const payload = buildBoardSummaryPayload(report, enrichedMembers);

  const response = await withGeminiRetry(() =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Write the executive summary for this market board briefing.

Regime: ${report.regime.toUpperCase()} (${(report.confidence * 100).toFixed(0)}% conviction)

Board briefing:
${payload}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: BOARD_SUMMARY_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: BOARD_SUMMARY_SCHEMA,
        temperature: 0.35,
      },
    }),
  );

  const text = response.text;
  if (!text) throw new Error("Empty Gemini board summary response");

  return parseSummary(text).executiveSummary;
}

async function enrichBoardWithGemini(
  report: MarketBoardReport,
): Promise<MarketBoardReport> {
  const client = getClient();
  if (!client) return { ...report, analysisMode: "rules" };

  const model = getGeminiModel();

  const results = await mapWithConcurrency(
    ENRICHABLE_BOARD_ROLES,
    getGeminiConcurrency(),
    (role) => enrichMember(client, model, role, report),
  );

  const enrichedByRole = new Map<BoardRole, BoardMemberOutput>();
  const failedRoles: string[] = [];

  results.forEach((result, index) => {
    const role = ENRICHABLE_BOARD_ROLES[index]!;
    if (result.status === "fulfilled") {
      enrichedByRole.set(role, result.value);
      return;
    }
    failedRoles.push(role);
    console.error(`Gemini board enrichment failed for ${role}:`, result.reason);
    const fallback = report.members.find((m) => m.role === role);
    if (fallback) enrichedByRole.set(role, fallback);
  });

  const members = report.members.map(
    (member) => enrichedByRole.get(member.role) ?? member,
  );

  let executiveSummary = report.executiveSummary;
  let summaryEnriched = false;
  try {
    const enriched = await enrichSummary(client, model, report, members);
    if (enriched.length > 0) {
      executiveSummary = enriched;
      summaryEnriched = true;
    }
  } catch (error) {
    console.error("Gemini board summary failed:", error);
  }

  const anyMemberEnriched =
    failedRoles.length < ENRICHABLE_BOARD_ROLES.length;

  return {
    ...report,
    executiveSummary,
    members,
    analysisMode: anyMemberEnriched || summaryEnriched ? "gemini" : "rules",
    llmModel: anyMemberEnriched || summaryEnriched ? model : undefined,
    llmFallbackReason:
      failedRoles.length > 0
        ? `Partial Gemini enrichment; rule-based text kept for: ${failedRoles.join(", ")}`
        : undefined,
  };
}

export async function runBoardWithGemini(
  report: MarketBoardReport,
): Promise<MarketBoardReport> {
  if (!isGeminiConfigured()) {
    return { ...report, analysisMode: "rules" };
  }

  try {
    return await enrichBoardWithGemini(report);
  } catch (error) {
    console.error("Gemini board enrichment failed, using rules:", error);
    return {
      ...report,
      analysisMode: "rules",
      llmFallbackReason:
        error instanceof Error ? error.message : "Gemini enrichment failed",
    };
  }
}
