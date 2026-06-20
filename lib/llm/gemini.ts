import { GoogleGenAI } from "@google/genai";
import {
  buildGeminiContextPayload,
  GEMINI_ENRICHMENT_SCHEMA,
  GEMINI_ENRICHMENT_SYSTEM,
  type GeminiEnrichmentResult,
} from "@/lib/llm/prompts";
import type { AnalysisContext, AnalysisReport } from "@/lib/types";

const DEFAULT_MODEL = "gemini-2.5-flash";

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
}

function parseEnrichment(raw: string): GeminiEnrichmentResult {
  const parsed = JSON.parse(raw) as GeminiEnrichmentResult;
  if (!parsed.executiveSummary || !Array.isArray(parsed.agents)) {
    throw new Error("Invalid Gemini enrichment shape");
  }
  return parsed;
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
  const payload = buildGeminiContextPayload(context, baseline);

  const response = await client.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Enhance the committee narratives for this stock analysis.\n\nBaseline recommendation: ${baseline.recommendation} (${(baseline.confidence * 100).toFixed(0)}% confidence)\n\nData and baseline report:\n${payload}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: GEMINI_ENRICHMENT_SYSTEM,
      responseMimeType: "application/json",
      responseSchema: GEMINI_ENRICHMENT_SCHEMA,
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Empty Gemini response");
  }

  const enrichment = parseEnrichment(text);
  const enrichmentByRole = new Map(
    enrichment.agents.map((agent) => [agent.role, agent]),
  );

  const agentOutputs = baseline.agentOutputs.map((agent) => {
    const enriched = enrichmentByRole.get(agent.role);
    if (!enriched) return agent;

    return {
      ...agent,
      keyPoints:
        enriched.keyPoints.length > 0 ? enriched.keyPoints : agent.keyPoints,
      concerns:
        enriched.concerns.length > 0 ? enriched.concerns : agent.concerns,
    };
  });

  return {
    ...baseline,
    executiveSummary: enrichment.executiveSummary || baseline.executiveSummary,
    agentOutputs,
    analysisMode: "gemini",
    llmModel: model,
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
