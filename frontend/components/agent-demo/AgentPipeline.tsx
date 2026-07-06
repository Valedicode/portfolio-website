"use client";

/**
 * Animated visualization of the three-agent pipeline.
 *
 * Each agent has a mascot avatar (public/agents/*.png) whose animation
 * reflects its state:
 *  - idle:   dimmed/desaturated, floating gently
 *  - active: full color, bouncing, with a spinning dashed halo
 *  - done:   full color with a settle "pop"
 *
 * When work hands off from one agent to the next, a data packet travels
 * along the connector between them. Everything degrades to plain color
 * changes when prefers-reduced-motion is set.
 */
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export const AGENT_ROLES = [
  {
    name: "Planner",
    job: "parses your question into filters",
    icon: "/agents/planner.png",
  },
  {
    name: "Retriever",
    job: "matches filters against my data",
    icon: "/agents/retriever.png",
  },
  {
    name: "Synthesizer",
    job: "ranks results into an answer",
    icon: "/agents/synthesizer.png",
  },
] as const;

type NodeState = "idle" | "active" | "done";

/** Per-state animation for the mascot image itself. */
function mascotAnimation(state: NodeState, reduced: boolean) {
  if (reduced) return {};
  switch (state) {
    case "idle":
      // Gentle float, like a process waiting for work.
      return {
        animate: { y: [0, -2.5, 0] },
        transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" as const },
      };
    case "active":
      // Energetic bounce + wiggle while the agent works.
      return {
        animate: { y: [0, -4, 0], rotate: [-4, 4, -4] },
        transition: {
          y: { duration: 0.5, repeat: Infinity, ease: "easeInOut" as const },
          rotate: { duration: 0.7, repeat: Infinity, ease: "easeInOut" as const },
        },
      };
    case "done":
      // One-shot settle pop when the agent finishes.
      return {
        animate: { y: 0, rotate: 0, scale: [1, 1.18, 1] },
        transition: { duration: 0.35 },
      };
  }
}

function AgentAvatar({
  icon,
  state,
  floatDelay,
  reduced,
}: {
  icon: string;
  state: NodeState;
  /** Desyncs the idle float so the agents don't bob in unison. */
  floatDelay: number;
  reduced: boolean;
}) {
  const anim = mascotAnimation(state, reduced);

  return (
    <div className="relative h-12 w-12 shrink-0">
      {/* Spinning dashed halo + orbiting satellite while active */}
      <AnimatePresence>
        {state === "active" && !reduced && (
          <motion.div
            key="halo"
            className="absolute -inset-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            exit={{ opacity: 0 }}
            transition={{
              rotate: { duration: 3, repeat: Infinity, ease: "linear" },
              opacity: { duration: 0.2 },
            }}
          >
            <span className="absolute inset-0 rounded-full border border-dashed border-accent/60" />
            <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -ml-[3px] -mt-[3px] rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        {...anim}
        transition={
          state === "idle" && !reduced
            ? { ...anim.transition, delay: floatDelay }
            : anim.transition
        }
        className="h-12 w-12"
      >
        <Image
          src={icon}
          alt=""
          width={48}
          height={48}
          className={`select-none transition-[filter,opacity] duration-300 ${
            state === "idle" ? "opacity-55 grayscale" : "opacity-100 grayscale-0"
          }`}
          draggable={false}
        />
      </motion.div>
    </div>
  );
}

/**
 * Line between two agent nodes. While the downstream agent is active, a
 * small packet repeatedly travels along it — data flowing through the
 * pipeline. Rendered twice (vertical for mobile, horizontal for sm+)
 * because the travel axis changes with the layout.
 */
function Connector({
  lit,
  flowing,
  reduced,
}: {
  lit: boolean;
  flowing: boolean;
  reduced: boolean;
}) {
  const packet = "absolute rounded-full bg-accent shadow-[0_0_8px_var(--accent)]";
  const travel = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };

  return (
    <div className="relative h-6 w-px shrink-0 self-center sm:h-px sm:w-10">
      <div
        className={`absolute inset-0 transition-colors duration-300 ${
          lit ? "bg-accent/70" : "bg-line"
        }`}
      />
      <AnimatePresence>
        {flowing && !reduced && (
          <>
            {/* Mobile: vertical travel */}
            <motion.span
              {...travel}
              className={`${packet} h-1.5 w-1.5 sm:hidden`}
              style={{ left: -2.5 }}
              animate={{ opacity: 1, top: ["-8%", "88%"] }}
              transition={{
                top: { duration: 0.65, repeat: Infinity, ease: "easeInOut" },
                opacity: { duration: 0.15 },
              }}
            />
            {/* Desktop: horizontal travel */}
            <motion.span
              {...travel}
              className={`${packet} hidden h-1.5 w-1.5 sm:block`}
              style={{ top: -2.5 }}
              animate={{ opacity: 1, left: ["-4%", "92%"] }}
              transition={{
                left: { duration: 0.65, repeat: Infinity, ease: "easeInOut" },
                opacity: { duration: 0.15 },
              }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

interface AgentPipelineProps {
  /** -1 = idle, 0..2 = agent index currently active, 3 = pipeline complete */
  stage: number;
  /** True once the run has finished and results are published. */
  done: boolean;
}

export default function AgentPipeline({ stage, done }: AgentPipelineProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <div
      className="mt-8 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center"
      aria-hidden="true"
    >
      {AGENT_ROLES.map((role, i) => {
        const isActive = stage === i && !done;
        const isDone = stage > i || done;
        const state: NodeState = isActive ? "active" : isDone ? "done" : "idle";
        return (
          <div key={role.name} className="flex flex-1 flex-col items-stretch gap-2 sm:flex-row">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.25, delay: i * 0.08 }}
              className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 transition-[border-color,background-color,box-shadow] duration-200 ${
                isActive
                  ? "border-accent bg-accent/10 shadow-[0_0_24px_-8px_var(--accent)]"
                  : isDone
                    ? "border-accent/40 bg-panel"
                    : "border-line bg-panel"
              }`}
            >
              <AgentAvatar
                icon={role.icon}
                state={state}
                floatDelay={i * 0.9}
                reduced={prefersReducedMotion}
              />
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold tracking-wide text-fg">
                  {role.name}
                </p>
                <p className="truncate text-xs text-muted">{role.job}</p>
              </div>
            </motion.div>
            {i < AGENT_ROLES.length - 1 && (
              <Connector
                lit={stage > i || done}
                // The packet flows on connector i while agent i+1 is working.
                flowing={stage === i + 1 && !done}
                reduced={prefersReducedMotion}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
