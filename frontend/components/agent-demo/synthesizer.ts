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

/** "A", "A and B", "A, B and C". */
function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function summarize(results: KnowledgeEntry[], plan: QueryPlan): string {
  if (results.length === 0) {
    return "I couldn't find anything in Kevin's portfolio that matches that. Try asking about a technology, a kind of project, or his experience.";
  }

  const projects = results.filter((r) => r.type === "project");
  const topicWords = plan.tags.length > 0 ? plan.tags : plan.keywords;
  const topic = topicWords.length > 0 ? ` related to ${joinNatural(topicWords)}` : "";
  // Name the top results so the answer is useful on its own, even when no
  // projects matched and the grid below stays empty.
  const named = joinNatural(results.slice(0, 3).map((r) => r.title));

  if (plan.sort === "complexity" && projects.length > 0) {
    const rest = projects.length - 1;
    return `Kevin's most complex system is ${projects[0].title}.${
      rest > 0 ? ` The grid below shows ${rest} more, ranked by complexity.` : ""
    }`;
  }
  if (plan.sort === "recency") {
    return `Starting with the most recent, Kevin's work includes ${named}.`;
  }
  if (projects.length === 0) {
    return `Here's what matches${topic}: ${named}.`;
  }
  const count = `${projects.length} project${projects.length === 1 ? "" : "s"}`;
  return `Kevin has ${count}${topic}, including ${joinNatural(
    projects.slice(0, 3).map((p) => p.title)
  )}.`;
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
