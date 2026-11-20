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
import { MAX_QUERY_CHARS, clipTrace, runLlmPipeline, warmUpBackend } from "./pipeline";
import type { PipelineRun } from "./types";

const EXAMPLE_PROMPTS = [
  "Show me multi-agent projects",
  "Anything with FastAPI?",
  "What's your most complex system?",
  "Where has Kevin worked?",
];

/**
 * Delay between revealing one agent's trace and the next. The agents have
 * already finished when the response arrives, so this stays short: the
 * answer appears ~0.4s after the backend responds, not after a fake delay.
 */
const STAGE_MS = 120;
/** After this long, tell the visitor the agents may be waking up. */
const SLOW_HINT_MS = 5_000;

export default function AgentDemo() {
  const { setRun, setStatus } = useAgents();
  const prefersReducedMotion = useReducedMotion();

  const [query, setQuery] = useState("");
  // -1 = idle, 0..2 = agent index currently active, 3 = pipeline complete
  const [stage, setStage] = useState(-1);
  const [pendingRun, setPendingRun] = useState<PipelineRun | null>(null);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState("");
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Bumped by every ask/reset so a slow, superseded request is discarded.
  const latestRequest = useRef(0);

  const clearTimers = () => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  };
  useEffect(() => clearTimers, []);
  useEffect(() => warmUpBackend(), []);

  /** Steps through stages 0 → 3, then publishes the run to the page. */
  const playStages = useCallback(
    (run: PipelineRun) => {
      setPendingRun(run);
      // A declined question leaves the project grid as it was.
      const gridRun = run.declined ? null : run;
      if (prefersReducedMotion) {
        setStage(3);
        setRun(gridRun);
        setStatus("idle");
        return;
      }
      [0, 1, 2, 3].forEach((s) => {
        timeouts.current.push(
          setTimeout(() => {
            setStage(s);
            if (s === 3) {
              setRun(gridRun);
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
      if (q.length > MAX_QUERY_CHARS) {
        setNotice(`Please keep questions under ${MAX_QUERY_CHARS} characters.`);
        return;
      }
      setNotice("");
      const requestId = ++latestRequest.current;
      clearTimers();
      setQuery(q);
      setStage(-1);
      setPendingRun(null);
      setSlow(false);
      setStatus("working");

      // Light up the Planner while the API call is in flight (the backend
      // runs the Planner and Synthesizer in parallel).
      setStage(0);
      const slowTimer = setTimeout(() => setSlow(true), SLOW_HINT_MS);
      timeouts.current.push(slowTimer);
      const run = await runLlmPipeline(q);
      clearTimeout(slowTimer);
      if (requestId !== latestRequest.current) return;
      setSlow(false);
      playStages(run);
    },
    [playStages, setStatus]
  );

  const reset = useCallback(() => {
    latestRequest.current++;
    clearTimers();
    setQuery("");
    setStage(-1);
    setPendingRun(null);
    setSlow(false);
    setRun(null);
    setStatus("idle");
  }, [setRun, setStatus]);

  const done = stage === 3 && pendingRun !== null;
  const traces = pendingRun
    ? [pendingRun.plan.trace, pendingRun.retrieval.trace, pendingRun.synthesis.trace]
    : [];

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel p-5 sm:p-8">
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
          maxLength={MAX_QUERY_CHARS}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotice("");
          }}
          onPaste={(e) => {
            // maxLength silently cuts pasted text, so say so (e.g. a pasted job description).
            const pasted = e.clipboardData.getData("text");
            if (query.length + pasted.length > MAX_QUERY_CHARS) {
              setNotice(
                `That text is too long, so it was cut to ${MAX_QUERY_CHARS} characters. Ask a short question, e.g. "Does Kevin fit a backend internship?"`
              );
            }
          }}
          aria-describedby="agent-query-hint"
          placeholder="Ask about my projects, skills, or experience…"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-4 py-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-accent px-5 py-3 font-mono text-sm font-medium text-on-accent transition-colors hover:bg-accent-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

      {/* Length hint: counter near the limit, or the reason text was cut */}
      <p
        id="agent-query-hint"
        role="status"
        className={`mt-2 min-h-4 font-mono text-xs ${notice ? "text-accent" : "text-muted"}`}
      >
        {notice ||
          (query.length > MAX_QUERY_CHARS * 0.8
            ? `${query.length}/${MAX_QUERY_CHARS} characters`
            : "")}
      </p>

      {/* Example prompts */}
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
      </div>

      {/* Animated pipeline visualization */}
      <AgentPipeline stage={stage} done={done} />

      {/* Log panel */}
      <div
        className="mt-4 min-h-24 min-w-0 overflow-hidden break-words rounded-lg border border-line bg-bg p-4 font-mono text-xs leading-relaxed [overflow-wrap:anywhere]"
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
            <span className="text-accent">planner</span> +{" "}
            <span className="text-accent">synthesizer</span> working in parallel…
            {slow && " (the agents may need a moment to wake up)"}
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
                  {clipTrace(trace)}
                </motion.p>
              )
          )}
        </AnimatePresence>
      </div>

      {/* Final answer: prose, kept apart from the terse agent log */}
      <div aria-live="polite">
        {done && pendingRun && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-4 rounded-lg border border-accent/30 bg-bg p-4"
          >
            <p className="font-mono text-xs text-accent">answer</p>
            <p className="mt-2 break-words leading-relaxed text-fg [overflow-wrap:anywhere]">
              {pendingRun.synthesis.summary}
            </p>
            {!pendingRun.declined && pendingRun.synthesis.projectIds.length > 0 && (
              <p className="mt-3 text-sm text-muted">
                For more details, the Selected work section below is filtered to{" "}
                {pendingRun.synthesis.projectIds.length === 1
                  ? "this project"
                  : `these ${pendingRun.synthesis.projectIds.length} projects`}
                .{" "}
                <a
                  href="#projects"
                  className="font-medium text-accent underline-offset-4 hover:text-accent-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  View selected work ↓
                </a>
              </p>
            )}
            {pendingRun.engine === "rules" && (
              <p className="mt-2 font-mono text-xs text-muted">
                quick offline answer: the AI agents are unavailable right now
              </p>
            )}
          </motion.div>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        A Planner, Retriever, and Synthesizer agent work together over my real
        project data, and the grid below re-filters with the result.
      </p>
    </div>
  );
}
