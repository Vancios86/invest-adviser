import { GoogleGenAI } from "@google/genai";
import {
  buildBoardExecutiveSummary,
  buildChiefStrategistOutput,
  CORE_BOARD_ROLES,
  regimeFromMembers,
} from "@/lib/market/board";
import { getGeminiModel, isGeminiConfigured } from "@/lib/llm/gemini";
import {
  getGeminiConcurrency,
  mapWithConcurrency,
  withGeminiRetry,
} from "@/lib/llm/gemini-retry";
import {
  BOARD_MEMBER_SCHEMA,
  BOARD_MEMBER_SYSTEM,
  BOARD_SUMMARY_SCHEMA,
  BOARD_SUMMARY_SYSTEM,
  buildBoardMemberPayload,
  buildBoardSummaryPayload,
  CHIEF_BOARD_ENRICHMENT_ROLES,
  CORE_BOARD_ENRICHMENT_ROLES,
  type BoardMemberNarrative,
  type BoardSummaryResult,
} from "@/lib/market/board-prompts";
import type {
  BoardMemberOutput,
  BoardRole,
  MarketBoardReport,
  MarketSignal,
} from "@/lib/types";

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function parseSignal(value: unknown): MarketSignal {
  if (value === "risk_on" || value === "risk_off" || value === "neutral") {
    return value;
  }
  throw new Error("Invalid board member signal");
}

function parseMemberNarrative(raw: string): BoardMemberNarrative {
  const parsed = JSON.parse(raw) as BoardMemberNarrative;
  if (!Array.isArray(parsed.keyPoints) || !Array.isArray(parsed.watchItems)) {
    throw new Error("Invalid board member narrative shape");
  }
  return {
    signal: parseSignal(parsed.signal),
    confidence: clampConfidence(parsed.confidence),
    keyPoints: parsed.keyPoints,
    watchItems: parsed.watchItems,
  };
}

function parseSummary(raw: string): BoardSummaryResult {
  const parsed = JSON.parse(raw) as BoardSummaryResult;
  if (typeof parsed.executiveSummary !== "string") {
    throw new Error("Invalid board summary shape");
  }
  return parsed;
}

function mergeMemberNarrative(
  baseline: BoardMemberOutput,
  narrative: BoardMemberNarrative,
): BoardMemberOutput {
  return {
    ...baseline,
    signal: narrative.signal,
    confidence: narrative.confidence,
    keyPoints:
      narrative.keyPoints.length > 0 ? narrative.keyPoints : baseline.keyPoints,
    watchItems:
      narrative.watchItems.length > 0
        ? narrative.watchItems
        : baseline.watchItems,
  };
}

function buildCoreMemberUserPrompt(
  baseline: BoardMemberOutput,
  payload: string,
): string {
  return `Deliver the ${baseline.displayName} desk view on the current market.

Rules-engine baseline:
- Signal: ${baseline.signal}
- Confidence: ${(baseline.confidence * 100).toFixed(0)}%

You may revise signal and confidence if the data warrants it. Explain material changes in your keyPoints.

Committee context and market data:
${payload}`;
}

function buildChiefStrategistUserPrompt(
  baseline: BoardMemberOutput,
  payload: string,
): string {
  return `Deliver the ${baseline.displayName} synthesis for the current market.

Draft board regime in the payload is your starting point — synthesize the updated desk views, surface agreement and dissent, and align your signal/confidence with how unified the board is.

Committee context:
${payload}`;
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
              text:
                role === "chief_strategist"
                  ? buildChiefStrategistUserPrompt(baseline, payload)
                  : buildCoreMemberUserPrompt(baseline, payload),
            },
          ],
        },
      ],
      config: {
        systemInstruction: BOARD_MEMBER_SYSTEM[role],
        responseMimeType: "application/json",
        responseSchema: BOARD_MEMBER_SCHEMA,
        temperature: role === "chief_strategist" ? 0.45 : 0.4,
      },
    }),
  );

  const text = response.text;
  if (!text) throw new Error(`Empty Gemini response for ${role}`);

  return mergeMemberNarrative(baseline, parseMemberNarrative(text));
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

function assembleMembers(
  report: MarketBoardReport,
  enrichedByRole: Map<BoardRole, BoardMemberOutput>,
): BoardMemberOutput[] {
  return report.members.map(
    (member) => enrichedByRole.get(member.role) ?? member,
  );
}

function buildReportWithEnrichedCore(
  report: MarketBoardReport,
  enrichedByRole: Map<BoardRole, BoardMemberOutput>,
): MarketBoardReport {
  const enrichedCore = CORE_BOARD_ROLES.map(
    (role) => enrichedByRole.get(role)!,
  );
  const { regime, confidence } = regimeFromMembers(enrichedCore);
  const chief = buildChiefStrategistOutput(
    report.snapshot,
    enrichedCore,
    regime,
    confidence,
  );

  const members = assembleMembers(report, enrichedByRole).map((member) => {
    if (member.role === "chief_strategist") {
      return chief;
    }
    return enrichedByRole.get(member.role) ?? member;
  });

  return {
    ...report,
    regime,
    confidence,
    executiveSummary: buildBoardExecutiveSummary(
      regime,
      confidence,
      enrichedCore,
    ),
    members,
  };
}

async function enrichBoardWithGemini(
  report: MarketBoardReport,
): Promise<MarketBoardReport> {
  const client = getClient();
  if (!client) return { ...report, analysisMode: "rules" };

  const model = getGeminiModel();
  const enrichedByRole = new Map<BoardRole, BoardMemberOutput>();
  const failedRoles: string[] = [];

  const coreResults = await mapWithConcurrency(
    CORE_BOARD_ENRICHMENT_ROLES,
    getGeminiConcurrency(),
    (role) => enrichMember(client, model, role, report),
  );

  coreResults.forEach((result, index) => {
    const role = CORE_BOARD_ENRICHMENT_ROLES[index]!;
    if (result.status === "fulfilled") {
      enrichedByRole.set(role, result.value);
      return;
    }

    failedRoles.push(role);
    console.error(`Gemini board enrichment failed for ${role}:`, result.reason);
    const fallback = report.members.find((m) => m.role === role);
    if (fallback) enrichedByRole.set(role, fallback);
  });

  let workingReport = buildReportWithEnrichedCore(report, enrichedByRole);

  const chiefResults = await mapWithConcurrency(
    CHIEF_BOARD_ENRICHMENT_ROLES,
    getGeminiConcurrency(),
    (role) => enrichMember(client, model, role, workingReport),
  );

  chiefResults.forEach((result, index) => {
    const role = CHIEF_BOARD_ENRICHMENT_ROLES[index]!;
    if (result.status === "fulfilled") {
      enrichedByRole.set(role, result.value);
      return;
    }

    failedRoles.push(role);
    console.error(`Gemini board enrichment failed for ${role}:`, result.reason);
    const fallback = workingReport.members.find((m) => m.role === role);
    if (fallback) enrichedByRole.set(role, fallback);
  });

  const members = assembleMembers(workingReport, enrichedByRole);

  let executiveSummary = workingReport.executiveSummary;
  let summaryEnriched = false;
  try {
    const enriched = await enrichSummary(client, model, workingReport, members);
    if (enriched.length > 0) {
      executiveSummary = enriched;
      summaryEnriched = true;
    }
  } catch (error) {
    console.error("Gemini board summary failed:", error);
  }

  const totalRoles =
    CORE_BOARD_ENRICHMENT_ROLES.length + CHIEF_BOARD_ENRICHMENT_ROLES.length;
  const anyMemberEnriched = failedRoles.length < totalRoles;

  return {
    ...workingReport,
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
