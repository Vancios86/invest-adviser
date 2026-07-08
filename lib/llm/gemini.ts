import { GoogleGenAI } from "@google/genai";
import {
  AGENT_GEMINI_SYSTEM,
  buildAgentGeminiPayload,
  buildExecutiveSummaryPayload,
  ENRICHABLE_AGENT_ROLES,
  GEMINI_AGENT_NARRATIVE_SCHEMA,
  GEMINI_EXECUTIVE_SUMMARY_SCHEMA,
  GEMINI_EXECUTIVE_SUMMARY_SYSTEM,
  type GeminiAgentNarrative,
  type GeminiExecutiveSummaryResult,
} from "@/lib/llm/prompts";
import { getGeminiConcurrency, mapWithConcurrency, withGeminiRetry } from "@/lib/llm/gemini-retry";
import type {
  AgentOutput,
  AgentRole,
  AnalysisContext,
  AnalysisReport,
} from "@/lib/types";

const DEFAULT_MODEL = "gemini-2.5-flash";

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export function getGeminiClient(): GoogleGenAI | null {
  return getClient();
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
}

function parseAgentNarrative(raw: string): GeminiAgentNarrative {
  const parsed = JSON.parse(raw) as GeminiAgentNarrative;
  if (!Array.isArray(parsed.keyPoints) || !Array.isArray(parsed.concerns)) {
    throw new Error("Invalid agent narrative shape");
  }
  return parsed;
}

function parseExecutiveSummary(raw: string): GeminiExecutiveSummaryResult {
  const parsed = JSON.parse(raw) as GeminiExecutiveSummaryResult;
  if (typeof parsed.executiveSummary !== "string") {
    throw new Error("Invalid executive summary shape");
  }
  return parsed;
}

async function enrichSingleAgent(
  client: GoogleGenAI,
  model: string,
  role: AgentRole,
  context: AnalysisContext,
  baseline: AnalysisReport,
): Promise<AgentOutput> {
  const baselineAgent = baseline.agentOutputs.find((agent) => agent.role === role);
  if (!baselineAgent) {
    throw new Error(`Missing baseline agent: ${role}`);
  }

  const payload = buildAgentGeminiPayload(role, context, baseline);

  const response = await withGeminiRetry(() =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Rewrite the ${baselineAgent.displayName} commentary for ${context.symbol} (${context.companyName}).

Fixed signal: ${baselineAgent.signal}
Fixed confidence: ${(baselineAgent.confidence * 100).toFixed(0)}%

Context and baseline narrative:
${payload}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: AGENT_GEMINI_SYSTEM[role],
        responseMimeType: "application/json",
        responseSchema: GEMINI_AGENT_NARRATIVE_SCHEMA,
        temperature: 0.4,
      },
    }),
  );

  const text = response.text;
  if (!text) {
    throw new Error(`Empty Gemini response for ${role}`);
  }

  const narrative = parseAgentNarrative(text);

  return {
    ...baselineAgent,
    keyPoints:
      narrative.keyPoints.length > 0
        ? narrative.keyPoints
        : baselineAgent.keyPoints,
    concerns:
      narrative.concerns.length > 0
        ? narrative.concerns
        : baselineAgent.concerns,
  };
}

async function enrichExecutiveSummary(
  client: GoogleGenAI,
  model: string,
  context: AnalysisContext,
  baseline: AnalysisReport,
  enrichedAgents: AgentOutput[],
): Promise<string> {
  const payload = buildExecutiveSummaryPayload(
    context,
    baseline,
    enrichedAgents,
  );

  const response = await withGeminiRetry(() =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Write the executive summary for this committee report.

Recommendation: ${baseline.recommendation.toUpperCase()} (${(baseline.confidence * 100).toFixed(0)}% confidence)

Committee report:
${payload}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: GEMINI_EXECUTIVE_SUMMARY_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: GEMINI_EXECUTIVE_SUMMARY_SCHEMA,
        temperature: 0.35,
      },
    }),
  );

  const text = response.text;
  if (!text) {
    throw new Error("Empty Gemini executive summary response");
  }

  return parseExecutiveSummary(text).executiveSummary;
}

export async function enrichReportWithGemini(
  context: AnalysisContext,
  baseline: AnalysisReport,
): Promise<AnalysisReport> {
  const client = getClient();
  if (!client) {
    return { ...baseline, analysisMode: "rules" };
  }

  const model = getGeminiModel();

  const enrichmentResults = await mapWithConcurrency(
    ENRICHABLE_AGENT_ROLES,
    getGeminiConcurrency(),
    (role) => enrichSingleAgent(client, model, role, context, baseline),
  );

  const enrichedByRole = new Map<AgentRole, AgentOutput>();
  const failedRoles: string[] = [];

  enrichmentResults.forEach((result, index) => {
    const role = ENRICHABLE_AGENT_ROLES[index]!;
    if (result.status === "fulfilled") {
      enrichedByRole.set(role, result.value);
      return;
    }

    failedRoles.push(role);
    console.error(`Gemini enrichment failed for ${role}:`, result.reason);
    const fallback = baseline.agentOutputs.find((agent) => agent.role === role);
    if (fallback) {
      enrichedByRole.set(role, fallback);
    }
  });

  const agentOutputs = baseline.agentOutputs.map(
    (agent) => enrichedByRole.get(agent.role) ?? agent,
  );

  let executiveSummary = baseline.executiveSummary;
  let summaryEnriched = false;
  try {
    executiveSummary = await enrichExecutiveSummary(
      client,
      model,
      context,
      baseline,
      agentOutputs,
    );
    summaryEnriched = true;
  } catch (error) {
    console.error("Gemini executive summary failed:", error);
  }

  const anyAgentEnriched =
    failedRoles.length < ENRICHABLE_AGENT_ROLES.length;
  const geminiUsed = anyAgentEnriched || summaryEnriched;

  const fallbackNotes: string[] = [];
  if (failedRoles.length > 0) {
    fallbackNotes.push(
      `Partial Gemini enrichment; rule-based text kept for: ${failedRoles.join(", ")}`,
    );
  }
  if (!summaryEnriched && anyAgentEnriched) {
    fallbackNotes.push("Executive summary kept rule-based (Gemini quota or error)");
  }

  return {
    ...baseline,
    executiveSummary,
    agentOutputs,
    analysisMode: geminiUsed ? "gemini" : "rules",
    llmModel: geminiUsed ? model : undefined,
    llmFallbackReason:
      fallbackNotes.length > 0 ? fallbackNotes.join(" · ") : undefined,
  };
}

export async function runAnalysisWithGemini(
  context: AnalysisContext,
  baseline: AnalysisReport,
): Promise<AnalysisReport> {
  if (!isGeminiConfigured()) {
    return { ...baseline, analysisMode: "rules" };
  }

  try {
    return await enrichReportWithGemini(context, baseline);
  } catch (error) {
    console.error("Gemini enrichment failed, using rule-based report:", error);
    return {
      ...baseline,
      analysisMode: "rules",
      llmFallbackReason:
        error instanceof Error ? error.message : "Gemini enrichment failed",
    };
  }
}
