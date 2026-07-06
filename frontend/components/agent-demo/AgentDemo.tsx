"use client";

/**
 * "Ask My Agents" — the interactive centerpiece.
 *
 * A query runs through three role-based agents (Planner → Retriever →
 * Synthesizer) over the shared knowledge base in /data. The pipeline
 * nodes light up in sequence, each agent logs a one-line trace, and the
 * Synthesizer's project IDs live-filter the project grid below via
 * AgentContext.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAgents } from "./AgentContext";
import AgentPipeline, { AGENT_ROLES } from "./AgentPipeline";
import { runLlmPipeline, runRulePipeline } from "./pipeline";
import type { PipelineRun } from "./types";

const EXAMPLE_PROMPTS = [
  "Show me multi-agent projects",
  "Anything with FastAPI?",
  "What's your most complex system?",
  "Where has Kevin worked?",
];

/** Delay between one agent finishing and the next lighting up. */
const STAGE_MS = 650;

type Engine = "rules" | "llm";

export default function AgentDemo() {
  const { setRun, setStatus } = useAgents();
  const prefersReducedMotion = useReducedMotion();

  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState<Engine>("rules");
  // -1 = idle, 0..2 = agent index currently active, 3 = pipeline complete
  const [stage, setStage] = useState(-1);
  const [pendingRun, setPendingRun] = useState<PipelineRun | null>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  };
  useEffect(() => clearTimers, []);

  /** Steps through stages 0 → 3, then publishes the run to the page. */
  const playStages = useCallback(
    (run: PipelineRun) => {
      setPendingRun(run);
      if (prefersReducedMotion) {
        setStage(3);
        setRun(run);
        setStatus("idle");
        return;
      }
      [0, 1, 2, 3].forEach((s) => {
        timeouts.current.push(
          setTimeout(() => {
            setStage(s);
            if (s === 3) {
              setRun(run);
              setStatus("idle");
            }
          }, s * STAGE_MS)
        );
      });
    },
    [prefersReducedMotion, setRun, setStatus]
  );

  const ask = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q) return;
      clearTimers();
      setQuery(q);
      setStage(-1);
      setPendingRun(null);
      setStatus("working");

      if (engine === "llm") {
        // Show the Planner as "thinking" while the API call is in flight.
        setStage(0);
        const run = await runLlmPipeline(q);
        playStages(run);
      } else {
        playStages(runRulePipeline(q));
      }
    },
    [engine, playStages, setStatus]
  );

  const reset = useCallback(() => {
    clearTimers();
    setQuery("");
    setStage(-1);
    setPendingRun(null);
    setRun(null);
    setStatus("idle");
  }, [setRun, setStatus]);

  const done = stage === 3 && pendingRun !== null;
  const traces = pendingRun
    ? [pendingRun.plan.trace, pendingRun.retrieval.trace, pendingRun.synthesis.trace]
    : [];

  return (
    <div className="rounded-xl border border-line bg-panel p-5 sm:p-8">
      {/* Query input */}
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(query);
        }}
      >
        <label htmlFor="agent-query" className="sr-only">
          Ask a question about Kevin&apos;s work
        </label>
        <input
          id="agent-query"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about my projects, skills, or experience…"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-4 py-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-accent px-5 py-3 font-mono text-sm font-medium text-bg transition-colors hover:bg-accent-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Run agents
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-line px-4 py-3 font-mono text-sm text-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Reset
          </button>
        </div>
      </form>

      {/* Example prompts + engine toggle */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void ask(prompt)}
            className="rounded-full border border-line px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {prompt}
          </button>
        ))}
        <div className="ms-auto flex items-center gap-2" role="group" aria-label="Reasoning engine">
          {(
            [
              ["rules", "Simulated"],
              ["llm", "AI reasoning"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={engine === value}
              onClick={() => setEngine(value)}
              className={`rounded-full px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                engine === value
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Animated pipeline visualization */}
      <AgentPipeline stage={stage} done={done} />

      {/* Log panel */}
      <div
        className="mt-4 min-h-24 rounded-lg border border-line bg-bg p-4 font-mono text-xs leading-relaxed"
        role="log"
        aria-live="polite"
        aria-label="Agent activity log"
      >
        {stage === -1 && (
          <p className="text-muted">
            <span className="text-accent">$</span> awaiting query — traces from each
            agent will appear here
          </p>
        )}
        {stage === 0 && !pendingRun && (
          <p className="text-muted">
            <span className="text-accent">planner</span> thinking…
          </p>
        )}
        <AnimatePresence>
          {traces.map(
            (trace, i) =>
              (stage > i || done) && (
                <motion.p
                  key={i}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-fg/85"
                >
                  <span className="text-accent">
                    {AGENT_ROLES[i].name.toLowerCase()}
                  </span>{" "}
                  {trace}
                </motion.p>
              )
          )}
        </AnimatePresence>
        {done && pendingRun && (
          <motion.p
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 border-t border-line pt-2 text-fg"
          >
            <span className="text-accent">answer</span> {pendingRun.synthesis.summary}
            {pendingRun.engine === "llm" ? " (via Claude)" : ""}
          </motion.p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        A Planner, Retriever, and Synthesizer agent work together over my real
        project data — the grid below re-filters with the result.
        {engine === "llm" &&
          " AI mode calls a serverless route; if it fails, the rule-based pipeline answers instead."}
      </p>
    </div>
  );
}
