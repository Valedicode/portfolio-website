/**
 * Runs the full Planner → Retriever → Synthesizer pipeline.
 *
 * Two engines produce the same `PipelineRun` shape:
 *  - `runLlmPipeline`   — the demo's engine: calls /api/agent-demo, which
 *    Next.js proxies to the Python LangChain backend (see /backend).
 *  - `runRulePipeline`  — deterministic, fully client-side, instant. Used
 *    only as the fallback when the LLM path fails, is slow, or is rate
 *    limited, so the demo never shows an error to the visitor.
 */
import { CV, PROJECTS } from "@/lib/knowledge";
import { isPersonalDataRequest, plan } from "./planner";
import { retrieve } from "./retriever";
import { synthesize } from "./synthesizer";
import type { PipelineRun } from "./types";

/** Slightly above the proxy's own backend timeout (app/api/agent-demo/route.ts). */
const LLM_TIMEOUT_MS = 30_000;

/** Fire-and-forget: wakes a sleeping backend before the first question. */
export function warmUpBackend(): void {
  fetch("/api/agent-demo", { method: "GET" }).catch(() => {});
}

/** Fixed privacy answer, from the same profile text the AI agents use. */
function declinePersonalData(query: string): PipelineRun {
  return {
    query,
    engine: "rules",
    declined: true,
    plan: {
      tags: [],
      keywords: [],
      types: null,
      sort: "relevance",
      trace: "personal-data request → declined by the privacy rule",
    },
    retrieval: { candidates: [], trace: "skipped: request declined" },
    synthesis: {
      results: [],
      projectIds: [],
      summary: `${CV.profile.age} ${CV.profile.contact}`,
      trace: "skipped: fixed privacy message instead of a search",
    },
  };
}

export function runRulePipeline(query: string): PipelineRun {
  if (isPersonalDataRequest(query)) return declinePersonalData(query);
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
  declined?: boolean;
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
      declined: data.declined === true,
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
