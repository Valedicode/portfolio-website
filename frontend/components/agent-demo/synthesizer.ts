/**
 * Synthesizer agent (rule-based tier).
 *
 * Job: rank the Retriever's candidates according to the Planner's sort
 * mode, keep the strongest ones, and compose a short natural-language
 * answer. Its `projectIds` output is what live-filters the project grid.
 */
import type { KnowledgeEntry } from "@/lib/knowledge";
import type { QueryPlan, RetrievalResult, SynthesisResult } from "./types";

const MAX_RESULTS = 6;

function compare(a: KnowledgeEntry, b: KnowledgeEntry, plan: QueryPlan): number {
  if (plan.sort === "recency") return (b.year ?? 0) - (a.year ?? 0);
  if (plan.sort === "complexity") return (b.complexity ?? 0) - (a.complexity ?? 0);
  return 0; // relevance: keep score order from the Retriever
}

function summarize(results: KnowledgeEntry[], plan: QueryPlan): string {
  if (results.length === 0) {
    return "Nothing in the knowledge base matches that — try one of the example prompts.";
  }

  const projects = results.filter((r) => r.type === "project");
  const topic = plan.tags.length > 0 ? plan.tags.join(" + ") : plan.keywords.join(" ");
  const topicSuffix = topic ? ` related to “${topic}”` : "";

  if (plan.sort === "complexity" && projects.length > 0) {
    return `Most complex system: ${projects[0].title} — plus ${
      results.length - 1
    } more result${results.length === 2 ? "" : "s"} ranked by complexity.`;
  }
  if (plan.sort === "recency") {
    return `Most recent first: ${results
      .slice(0, 3)
      .map((r) => r.title)
      .join(", ")}${results.length > 3 ? ", …" : "."}`;
  }

  const kinds: string[] = [];
  if (projects.length > 0) kinds.push(`${projects.length} project${projects.length === 1 ? "" : "s"}`);
  const other = results.length - projects.length;
  if (other > 0) kinds.push(`${other} other entr${other === 1 ? "y" : "ies"}`);

  // When no projects matched, the grid below stays empty — name the
  // results here so the answer is still useful on its own.
  if (projects.length === 0) {
    return `Found ${kinds.join(" and ")}${topicSuffix}: ${results
      .slice(0, 3)
      .map((r) => r.title)
      .join("; ")}${results.length > 3 ? "; …" : "."}`;
  }

  return `Found ${kinds.join(" and ")}${topicSuffix}.`;
}

/** Ranks candidates, trims to the strongest, and writes the final answer. */
export function synthesize(
  plan: QueryPlan,
  retrieval: RetrievalResult
): SynthesisResult {
  const ranked = [...retrieval.candidates]
    .sort((a, b) => {
      const bySortMode = compare(a.entry, b.entry, plan);
      return bySortMode !== 0 ? bySortMode : b.score - a.score;
    })
    .slice(0, MAX_RESULTS)
    .map(({ entry }) => entry);

  const projectIds = ranked.filter((e) => e.type === "project").map((e) => e.id);

  return {
    results: ranked,
    projectIds,
    summary: summarize(ranked, plan),
    trace: `ranked by ${plan.sort} → kept top ${ranked.length}, ${projectIds.length} project${
      projectIds.length === 1 ? "" : "s"
    } sent to the grid`,
  };
}
