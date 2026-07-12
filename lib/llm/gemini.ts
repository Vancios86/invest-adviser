import { GoogleGenAI } from "@google/genai";
import {
  buildPortfolioManagerOutput,
  CORE_ANALYST_ROLES,
  synthesizeRecommendation,
} from "@/lib/agents/pipeline";
import {
  AGENT_GEMINI_SYSTEM,
  buildAgentGeminiPayload,
  buildExecutiveSummaryPayload,
  CORE_ENRICHMENT_ROLES,
  GEMINI_AGENT_NARRATIVE_SCHEMA,
  GEMINI_COMPLIANCE_NARRATIVE_SCHEMA,
  GEMINI_EXECUTIVE_SUMMARY_SCHEMA,
  GEMINI_EXECUTIVE_SUMMARY_SYSTEM,
  SYNTHESIS_ENRICHMENT_ROLES,
  type GeminiAgentNarrative,
  type GeminiComplianceNarrative,
  type GeminiExecutiveSummaryResult,
} from "@/lib/llm/prompts";
import {
  getGeminiConcurrency,
  mapWithConcurrency,
  withGeminiRetry,
} from "@/lib/llm/gemini-retry";
import type {
  AgentOutput,
  AgentRole,
  AgentSignal,
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

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function parseSignal(value: unknown): AgentSignal {
  if (value === "bullish" || value === "bearish" || value === "neutral") {
    return value;
  }
  throw new Error("Invalid agent signal");
}

function parseAgentNarrative(raw: string): GeminiAgentNarrative {
  const parsed = JSON.parse(raw) as GeminiAgentNarrative;
  if (!Array.isArray(parsed.keyPoints) || !Array.isArray(parsed.concerns)) {
    throw new Error("Invalid agent narrative shape");
  }
  return {
    signal: parseSignal(parsed.signal),
    confidence: clampConfidence(parsed.confidence),
    keyPoints: parsed.keyPoints,
    concerns: parsed.concerns,
  };
}

function parseComplianceNarrative(raw: string): GeminiComplianceNarrative {
  const parsed = JSON.parse(raw) as GeminiComplianceNarrative;
  if (!Array.isArray(parsed.keyPoints) || !Array.isArray(parsed.concerns)) {
    throw new Error("Invalid compliance narrative shape");
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

function mergeAgentNarrative(
  baselineAgent: AgentOutput,
  narrative: GeminiAgentNarrative,
): AgentOutput {
  return {
    ...baselineAgent,
    signal: narrative.signal,
    confidence: narrative.confidence,
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

function buildCoreAgentUserPrompt(
  baselineAgent: AgentOutput,
  context: AnalysisContext,
  payload: string,
): string {
  return `Deliver the ${baselineAgent.displayName} desk view for ${context.symbol} (${context.companyName}).

Rules-engine baseline:
- Signal: ${baselineAgent.signal}
- Confidence: ${(baselineAgent.confidence * 100).toFixed(0)}%

You may revise signal and confidence if the data warrants it. Explain material changes in your keyPoints.

Committee context and desk data:
${payload}`;
}

function buildPortfolioManagerUserPrompt(
  baselineAgent: AgentOutput,
  context: AnalysisContext,
  payload: string,
): string {
  return `Deliver the ${baselineAgent.displayName} synthesis for ${context.symbol} (${context.companyName}).

Draft committee recommendation in the payload is your starting point — synthesize the updated desk views, surface agreement and dissent, and align your signal/confidence with how unified the committee is.

Committee context:
${payload}`;
}

function buildComplianceUserPrompt(
  baselineAgent: AgentOutput,
  context: AnalysisContext,
  payload: string,
): string {
  return `Rewrite the ${baselineAgent.displayName} commentary for ${context.symbol} (${context.companyName}) in plain language.

Context and baseline narrative:
${payload}`;
}

async function enrichSingleAgent(
  client: GoogleGenAI,
  model: string,
  role: AgentRole,
  context: AnalysisContext,
  report: AnalysisReport,
): Promise<AgentOutput> {
  const baselineAgent = report.agentOutputs.find((agent) => agent.role === role);
  if (!baselineAgent) {
    throw new Error(`Missing baseline agent: ${role}`);
  }

  const payload = buildAgentGeminiPayload(role, context, report);
  const isCompliance = role === "compliance";

  const response = await withGeminiRetry(() =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: isCompliance
                ? buildComplianceUserPrompt(
                    baselineAgent,
                    context,
                    payload,
                  )
                : role === "portfolio_manager"
                  ? buildPortfolioManagerUserPrompt(
                      baselineAgent,
                      context,
                      payload,
                    )
                  : buildCoreAgentUserPrompt(
                      baselineAgent,
                      context,
                      payload,
                    ),
            },
          ],
        },
      ],
      config: {
        systemInstruction: AGENT_GEMINI_SYSTEM[role],
        responseMimeType: "application/json",
        responseSchema: isCompliance
          ? GEMINI_COMPLIANCE_NARRATIVE_SCHEMA
          : GEMINI_AGENT_NARRATIVE_SCHEMA,
        temperature: role === "portfolio_manager" ? 0.45 : 0.4,
      },
    }),
  );

  const text = response.text;
  if (!text) {
    throw new Error(`Empty Gemini response for ${role}`);
  }

  if (isCompliance) {
    const narrative = parseComplianceNarrative(text);
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

  return mergeAgentNarrative(baselineAgent, parseAgentNarrative(text));
}

async function enrichExecutiveSummary(
  client: GoogleGenAI,
  model: string,
  context: AnalysisContext,
  report: AnalysisReport,
  enrichedAgents: AgentOutput[],
): Promise<string> {
  const payload = buildExecutiveSummaryPayload(
    context,
    report,
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

Recommendation: ${report.recommendation.toUpperCase()} (${(report.confidence * 100).toFixed(0)}% confidence)

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

function assembleAgentOutputs(
  baseline: AnalysisReport,
  enrichedByRole: Map<AgentRole, AgentOutput>,
): AgentOutput[] {
  return baseline.agentOutputs.map(
    (agent) => enrichedByRole.get(agent.role) ?? agent,
  );
}

function buildReportWithEnrichedCore(
  baseline: AnalysisReport,
  context: AnalysisContext,
  enrichedByRole: Map<AgentRole, AgentOutput>,
): AnalysisReport {
  const enrichedCore = CORE_ANALYST_ROLES.map(
    (role) => enrichedByRole.get(role)!,
  );
  const synthesis = synthesizeRecommendation(enrichedCore, context);
  const portfolioManager = buildPortfolioManagerOutput(enrichedCore, synthesis);

  return {
    ...baseline,
    recommendation: synthesis.recommendation,
    confidence: synthesis.confidence,
    executiveSummary: synthesis.summary,
    agentOutputs: assembleAgentOutputs(baseline, enrichedByRole).map((agent) => {
      if (agent.role === "portfolio_manager") {
        return portfolioManager;
      }
      return enrichedByRole.get(agent.role) ?? agent;
    }),
  };
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
  const enrichedByRole = new Map<AgentRole, AgentOutput>();
  const failedRoles: string[] = [];

  const coreResults = await mapWithConcurrency(
    CORE_ENRICHMENT_ROLES,
    getGeminiConcurrency(),
    (role) => enrichSingleAgent(client, model, role, context, baseline),
  );

  coreResults.forEach((result, index) => {
    const role = CORE_ENRICHMENT_ROLES[index]!;
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

  let workingReport = buildReportWithEnrichedCore(
    baseline,
    context,
    enrichedByRole,
  );

  const synthesisResults = await mapWithConcurrency(
    SYNTHESIS_ENRICHMENT_ROLES,
    getGeminiConcurrency(),
    (role) => enrichSingleAgent(client, model, role, context, workingReport),
  );

  synthesisResults.forEach((result, index) => {
    const role = SYNTHESIS_ENRICHMENT_ROLES[index]!;
    if (result.status === "fulfilled") {
      enrichedByRole.set(role, result.value);
      return;
    }

    failedRoles.push(role);
    console.error(`Gemini enrichment failed for ${role}:`, result.reason);
    const fallback = workingReport.agentOutputs.find(
      (agent) => agent.role === role,
    );
    if (fallback) {
      enrichedByRole.set(role, fallback);
    }
  });

  const agentOutputs = assembleAgentOutputs(workingReport, enrichedByRole);
  let executiveSummary = workingReport.executiveSummary;
  let summaryEnriched = false;

  try {
    executiveSummary = await enrichExecutiveSummary(
      client,
      model,
      context,
      workingReport,
      agentOutputs,
    );
    summaryEnriched = true;
  } catch (error) {
    console.error("Gemini executive summary failed:", error);
  }

  const anyAgentEnriched =
    failedRoles.length < CORE_ENRICHMENT_ROLES.length + SYNTHESIS_ENRICHMENT_ROLES.length;
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
    ...workingReport,
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
