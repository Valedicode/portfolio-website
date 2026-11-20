/**
 * Planner agent (rule-based tier).
 *
 * Job: turn a free-text visitor question into a structured `QueryPlan` —
 * canonical tags, leftover keywords, an optional type filter, and a sort
 * mode. It never touches the knowledge base itself; that's the
 * Retriever's job.
 */
import type { EntryType } from "@/lib/knowledge";
import type { QueryPlan, SortMode } from "./types";

/**
 * Maps words a visitor might type to canonical knowledge-base tags.
 * Keys are matched against individual query words (lowercased).
 */
const TAG_ALIASES: Record<string, string> = {
  "multi-agent": "multi-agent",
  multiagent: "multi-agent",
  agent: "agent",
  agents: "agent",
  agentic: "agent",
  llm: "llm",
  llms: "llm",
  gpt: "llm",
  ml: "ml",
  "machine-learning": "ml",
  ai: "ml",
  nlp: "nlp",
  langchain: "langchain",
  langgraph: "langgraph",
  react: "react",
  next: "next.js",
  nextjs: "next.js",
  "next.js": "next.js",
  fastapi: "fastapi",
  django: "django",
  python: "python",
  java: "java",
  typescript: "typescript",
  javascript: "javascript",
  postgres: "postgresql",
  postgresql: "postgresql",
  security: "security",
  finance: "finance",
  financial: "finance",
  fullstack: "full-stack",
  "full-stack": "full-stack",
  frontend: "full-stack",
  backend: "full-stack",
  web: "full-stack",
  cli: "cli",
  terminal: "cli",
  systems: "systems",
  automation: "automation",
};

/** Phrases that signal the visitor wants a specific entry type. */
const TYPE_HINTS: [RegExp, EntryType][] = [
  [/\bprojects?\b|\bbuilt\b|\bbuild\b|\bportfolio\b/, "project"],
  [/\bskills?\b|\btech stack\b|\btools?\b|\bframeworks?\b|\blanguages?\b/, "skill"],
  [/\bexperience\b|\bworked\b|\binternships?\b|\bjobs?\b|\bemployment\b/, "experience"],
  [/\beducation\b|\bstud(y|ies|ied)\b|\bdegrees?\b|\buniversity\b/, "education"],
];

/**
 * Words too generic to be useful as fuzzy-match keywords. Includes the
 * sort-trigger words ("recent", "complex", …) — those set the sort mode
 * in detectSort() but would otherwise match nothing in the data and
 * wrongly zero out the candidate list.
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "do", "does",
  "did", "have", "has", "had", "what", "whats", "which", "who", "how", "why",
  "when", "where", "show", "me", "my", "your", "you", "his", "her", "their",
  "kevin", "kevins", "ha", "with", "using", "used", "uses", "in", "on", "of",
  "for", "about", "any", "anything", "some", "something", "there", "tell",
  "give", "list", "and", "or", "to", "that", "this", "it", "its", "most",
  "more", "can", "i", "s", "worked", "work",
  // sort triggers
  "recent", "recently", "latest", "newest", "new", "current", "currently",
  "complex", "complicated", "advanced", "hardest", "biggest", "ambitious",
  "impressive",
]);

function detectSort(query: string): SortMode {
  if (/\bcomplex|advanced|hardest|biggest|ambitious|impressive\b/.test(query)) {
    return "complexity";
  }
  if (/\brecent|latest|newest|new|current(ly)?\b/.test(query)) {
    return "recency";
  }
  return "relevance";
}

/** Parses the visitor's question into a structured query plan. */
export function plan(rawQuery: string): QueryPlan {
  const query = rawQuery.trim().toLowerCase();
  // Split on anything that's not a word character, dot, or hyphen so
  // tags like "next.js" and "multi-agent" survive tokenization.
  const words = query.split(/[^\w.\-]+/).filter(Boolean);

  const tags = new Set<string>();
  const keywords: string[] = [];

  for (const word of words) {
    const canonical = TAG_ALIASES[word];
    if (canonical) {
      tags.add(canonical);
      // A plain "agent" question covers single- and multi-agent projects alike.
      if (canonical === "agent") tags.add("multi-agent");
    } else if (!STOP_WORDS.has(word) && word.length > 1) {
      keywords.push(word);
    }
  }

  const types = TYPE_HINTS.filter(([re]) => re.test(query)).map(([, t]) => t);
  const sort = detectSort(query);

  // Compact, log-style trace, e.g. "filter: tag=multi-agent · type=project · sort=recency"
  const parts: string[] = [];
  if (tags.size > 0) parts.push(`tag=${[...tags].join(",")}`);
  if (keywords.length > 0) {
    const shown = keywords.slice(0, 6).join(",");
    const more = keywords.length > 6 ? ` +${keywords.length - 6} more` : "";
    parts.push(`keywords=${shown}${more}`);
  }
  if (types.length > 0) parts.push(`type=${types.join(",")}`);
  parts.push(`sort=${sort}`);

  return {
    tags: [...tags],
    keywords,
    types: types.length > 0 ? types : null,
    sort,
    trace: `parsed intent → ${parts.join(" · ")}`,
  };
}

/**
 * Privacy rule (the offline Planner's guard). Questions about Kevin's
 * private details are answered with a fixed message instead of a search,
 * matching what the AI agents say. Phrases, not single words, so questions
 * like "how does BiasLens address bias?" still go through.
 */
const PERSONAL_DATA_PATTERNS: RegExp[] = [
  /\bhow old\b/i,
  /\b(his|kevin'?s|your)\s+age\b/i,
  /\bage\s+of\s+(kevin|him)\b/i,
  /\b(birthday|birth ?date|date of birth|year of birth|when was (he|kevin) born)\b/i,
  /\b(his|kevin'?s|home|postal|street)\s+address\b/i,
  /\b(phone|telephone|mobile|cell)\s+number\b/i,
  /\b(his|kevin'?s)\s+(phone|telephone|mobile|cell)\b/i,
  /\b(call|text) (him|kevin)\b/i,
  /\b(salary|income|how much does (he|kevin) earn)\b/i,
  /\b(girlfriend|boyfriend|married|relationship status|religion|political views)\b/i,
  /\b(wie alt|geburtstag|geburtsdatum|adresse|telefonnummer|handynummer|gehalt)\b/i,
];

export function isPersonalDataRequest(query: string): boolean {
  return PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(query));
}
