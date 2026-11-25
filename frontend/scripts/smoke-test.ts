// Dev smoke test for the rule-based agent pipeline and the proxy's origin
// check (no browser needed).
// Run with: npx tsx scripts/smoke-test.ts
import assert from "node:assert/strict";
import { POST } from "../app/api/agent-demo/route";
import { runRulePipeline } from "../components/agent-demo/pipeline";

/** Status the proxy answers with for a POST carrying these headers. */
async function proxyStatus(headers: Record<string, string>): Promise<number> {
  const request = new Request("http://localhost:3000/api/agent-demo", {
    method: "POST",
    body: "{}", // no query: even a running backend rejects it without an LLM call
    headers,
  });
  return (await POST(request)).status;
}

async function checkOriginGuard(): Promise<void> {
  // Other websites are refused before anything reaches the backend.
  assert.equal(await proxyStatus({ "sec-fetch-site": "cross-site" }), 403);
  assert.equal(await proxyStatus({ origin: "https://evil.example", host: "localhost:3000" }), 403);
  assert.equal(await proxyStatus({}), 403);
  // The site's own pages get through (502/422 here: no backend, or no query).
  assert.notEqual(await proxyStatus({ "sec-fetch-site": "same-origin" }), 403);
  assert.notEqual(await proxyStatus({ origin: "http://192.168.0.5:3000", host: "192.168.0.5:3000" }), 403);
  console.log("\norigin guard: ok");
}

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

checkOriginGuard().catch((error) => {
  console.error(error);
  process.exit(1);
});
