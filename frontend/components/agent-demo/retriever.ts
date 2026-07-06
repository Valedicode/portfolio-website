/**
 * Retriever agent (rule-based tier).
 *
 * Job: take the Planner's structured `QueryPlan` and score every entry
 * in the shared knowledge base against it. It is deliberately dumb about
 * language — all query understanding happened in the Planner — and only
 * does matching: tag overlap, keyword hits, and type filtering.
 */
import { KNOWLEDGE_BASE, type KnowledgeEntry } from "@/lib/knowledge";
import type { QueryPlan, RetrievalResult, ScoredEntry } from "./types";

// Score weights: exact tag matches are the strongest signal, then title
// keywords, then description/skill-item keywords.
const WEIGHT_TAG = 3;
const WEIGHT_TITLE = 2;
const WEIGHT_TEXT = 1;

function scoreEntry(entry: KnowledgeEntry, plan: QueryPlan): number {
  let score = 0;

  for (const tag of plan.tags) {
    if (entry.tags.includes(tag)) score += WEIGHT_TAG;
  }

  const title = entry.title.toLowerCase();
  const text = (
    entry.description + " " + (entry.items?.join(" ") ?? "")
  ).toLowerCase();

  for (const keyword of plan.keywords) {
    if (title.includes(keyword)) score += WEIGHT_TITLE;
    else if (text.includes(keyword)) score += WEIGHT_TEXT;
  }

  return score;
}

function scanPool(pool: KnowledgeEntry[], plan: QueryPlan): ScoredEntry[] {
  const hasSignal = plan.tags.length > 0 || plan.keywords.length > 0;
  return (
    pool
      .map((entry) => ({ entry, score: scoreEntry(entry, plan) }))
      // With no usable signal (e.g. "show me everything"), keep the whole
      // pool at neutral score and let the Synthesizer sort it.
      .filter(({ score }) => (hasSignal ? score > 0 : true))
  );
}

/** Matches the plan against the knowledge base and returns scored candidates. */
export function retrieve(plan: QueryPlan): RetrievalResult {
  const pool = plan.types
    ? KNOWLEDGE_BASE.filter((e) => plan.types!.includes(e.type))
    : KNOWLEDGE_BASE;

  let candidates = scanPool(pool, plan);
  let widened = false;

  // If the type filter eliminated everything but the query had real
  // signal, widen to the full knowledge base rather than returning
  // nothing — mirrors how a retrieval agent would relax constraints.
  if (candidates.length === 0 && plan.types && pool.length < KNOWLEDGE_BASE.length) {
    candidates = scanPool(KNOWLEDGE_BASE, plan);
    widened = candidates.length > 0;
  }

  const scanned = widened ? KNOWLEDGE_BASE.length : pool.length;
  return {
    candidates,
    trace: `scanned ${scanned} entries${widened ? " (widened: type filter too strict)" : ""} → ${
      candidates.length
    } candidate${candidates.length === 1 ? "" : "s"} (tag +${WEIGHT_TAG}, title +${WEIGHT_TITLE}, text +${WEIGHT_TEXT})`,
  };
}
