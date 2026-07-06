// Dev smoke test for the rule-based agent pipeline (no browser needed).
// Run with: npx tsx scripts/smoke-test.ts
import { runRulePipeline } from "../components/agent-demo/pipeline";

const prompts = [
  "Show me multi-agent projects",
  "Anything with FastAPI?",
  "What's your most complex system?",
  "Where has Kevin worked?",
  "recent LLM work",
  "gibberish zzzz",
];

for (const prompt of prompts) {
  const run = runRulePipeline(prompt);
  console.log(`\n> ${prompt}`);
  console.log(`  planner:     ${run.plan.trace}`);
  console.log(`  retriever:   ${run.retrieval.trace}`);
  console.log(`  synthesizer: ${run.synthesis.trace}`);
  console.log(`  summary:     ${run.synthesis.summary}`);
  console.log(`  results:     ${run.synthesis.results.map((r) => r.id).join(", ") || "(none)"}`);
}
