/**
 * Runs the full Planner → Retriever → Synthesizer pipeline.
 *
 * Two engines produce the same `PipelineRun` shape:
 *  - `runRulePipeline`  — Tier 1: deterministic, fully client-side, instant.
 *  - `runLlmPipeline`   — Tier 2: calls /api/agent-demo, which Next.js
 *    proxies to the Python LangChain backend (see /backend). On any
 *    failure or slowness it falls back to Tier 1, so the demo never
 *    shows an error to the visitor.
 */
import { PROJECTS } from "@/lib/knowledge";
import { plan } from "./planner";
import { retrieve } from "./retriever";
import { synthesize } from "./synthesizer";
import type { PipelineRun } from "./types";

const LLM_TIMEOUT_MS = 12_000;

export function runRulePipeline(query: string): PipelineRun {
  const queryPlan = plan(query);
  const retrieval = retrieve(queryPlan);
  const synthesis = synthesize(queryPlan, retrieval);
  return { query, plan: queryPlan, retrieval, synthesis, engine: "rules" };
}

/** Shape the API route returns (validated loosely below). */
interface LlmResponse {
  plannerTrace: string;
  retrieverTrace: string;
  synthesizerTrace: string;
  summary: string;
  matchedIds: string[];
}

export async function runLlmPipeline(query: string): Promise<PipelineRun> {
  try {
    const res = await fetch("/api/agent-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`API responded with ${res.status}`);

    const data = (await res.json()) as LlmResponse;
    if (!Array.isArray(data.matchedIds) || typeof data.summary !== "string") {
      throw new Error("Malformed API response");
    }

    // Rebuild full entries from the IDs the LLM selected. Unknown IDs
    // (hallucinated ones) are dropped silently.
    const byId = new Map(PROJECTS.map((p) => [p.id, p]));
    const results = data.matchedIds
      .map((id) => byId.get(id))
      .filter((e) => e !== undefined);

    return {
      query,
      engine: "llm",
      plan: {
        tags: [],
        keywords: [],
        types: null,
        sort: "relevance",
        trace: data.plannerTrace,
      },
      retrieval: { candidates: [], trace: data.retrieverTrace },
      synthesis: {
        results,
        projectIds: results.map((e) => e.id),
        summary: data.summary,
        trace: data.synthesizerTrace,
      },
    };
  } catch {
    // Graceful degradation: the rule-based result is always available.
    return runRulePipeline(query);
  }
}
