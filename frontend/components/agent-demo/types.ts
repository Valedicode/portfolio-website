import type { EntryType, KnowledgeEntry } from "@/lib/knowledge";

/** How the Synthesizer should order its final results. */
export type SortMode = "relevance" | "recency" | "complexity";

/** Structured intent produced by the Planner from a free-text query. */
export interface QueryPlan {
  /** Canonical tags detected in the query (e.g. "multi-agent", "fastapi"). */
  tags: string[];
  /** Remaining free-text keywords used for fuzzy matching. */
  keywords: string[];
  /** Restrict results to these entry types, or null for "anything". */
  types: EntryType[] | null;
  sort: SortMode;
  /** One-line human-readable reasoning shown in the demo's log panel. */
  trace: string;
}

/** A knowledge-base entry with the Retriever's match score attached. */
export interface ScoredEntry {
  entry: KnowledgeEntry;
  score: number;
}

export interface RetrievalResult {
  candidates: ScoredEntry[];
  trace: string;
}

/** Final output of the pipeline, consumed by the UI and the project grid. */
export interface SynthesisResult {
  /** Ranked entries the Synthesizer kept (across all types). */
  results: KnowledgeEntry[];
  /** Subset of `results` that are projects — drives the grid filter. */
  projectIds: string[];
  /** Short natural-language answer for the visitor. */
  summary: string;
  trace: string;
}

/** One complete pipeline run: everything the UI needs to animate and log. */
export interface PipelineRun {
  query: string;
  plan: QueryPlan;
  retrieval: RetrievalResult;
  synthesis: SynthesisResult;
  /** Which engine produced this run. */
  engine: "rules" | "llm";
  /** The backend refused the question; `synthesis.summary` is its fixed message. */
  declined?: boolean;
}
