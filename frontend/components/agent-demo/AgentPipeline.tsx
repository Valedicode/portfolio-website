"use client";

/**
 * Animated visualization of the three-agent pipeline.
 *
 * Layout: cards and connectors are siblings in one flex/grid row — never
 * nested inside the same flex-1 group (that caused overflow at medium
 * widths because fixed-width connectors stole space from the cards).
 *
 *  - < lg:  vertical stack with short connectors between cards
 *  - lg+:   horizontal row, three equal cards with connectors between
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

function mascotAnimation(state: NodeState, reduced: boolean) {
  if (reduced) return {};
  switch (state) {
    case "idle":
      return {
        animate: { y: [0, -2.5, 0] },
        transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" as const },
      };
    case "active":
      return {
        animate: { y: [0, -4, 0], rotate: [-4, 4, -4] },
        transition: {
          y: { duration: 0.5, repeat: Infinity, ease: "easeInOut" as const },
          rotate: { duration: 0.7, repeat: Infinity, ease: "easeInOut" as const },
        },
      };
    case "done":
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
  compact,
}: {
  icon: string;
  state: NodeState;
  floatDelay: number;
  reduced: boolean;
  compact?: boolean;
}) {
  const anim = mascotAnimation(state, reduced);
  const size = compact ? "h-9 w-9" : "h-12 w-12";
  const px = compact ? 36 : 48;

  return (
    <div className={`relative shrink-0 ${size}`}>
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
            <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -ml-[3px] -mt-[3px] rounded-full bg-accent agent-packet-glow shadow-[0_0_6px_var(--graph-node)]" />
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
        className={size}
      >
        <Image
          src={icon}
          alt=""
          width={px}
          height={px}
          className={`select-none transition-[filter,opacity] duration-300 ${
            state === "idle" ? "opacity-55 grayscale" : "opacity-100 grayscale-0"
          }`}
          draggable={false}
        />
      </motion.div>
    </div>
  );
}

function Connector({
  lit,
  flowing,
  reduced,
  axis,
}: {
  lit: boolean;
  flowing: boolean;
  reduced: boolean;
  axis: "vertical" | "horizontal";
}) {
  const packet =
    "agent-packet-glow absolute rounded-full bg-accent shadow-[0_0_8px_var(--graph-node)]";
  const isVertical = axis === "vertical";

  return (
    <div
      className={`relative shrink-0 self-center ${
        isVertical ? "h-6 w-[2px]" : "h-[2px] w-6 lg:w-9"
      }`}
    >
      <div
        className={`absolute inset-0 transition-colors duration-300 ${
          lit ? "bg-accent/80" : "bg-line"
        }`}
      />
      <AnimatePresence>
        {flowing && !reduced && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={
              isVertical
                ? { opacity: 1, top: ["-8%", "88%"] }
                : { opacity: 1, left: ["-4%", "92%"] }
            }
            exit={{ opacity: 0 }}
            transition={
              isVertical
                ? {
                    top: { duration: 0.65, repeat: Infinity, ease: "easeInOut" as const },
                    opacity: { duration: 0.15 },
                  }
                : {
                    left: { duration: 0.65, repeat: Infinity, ease: "easeInOut" as const },
                    opacity: { duration: 0.15 },
                  }
            }
            className={`${packet} h-2 w-2`}
            style={isVertical ? { left: -3 } : { top: -3 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AgentCard({
  role,
  state,
  index,
  reduced,
}: {
  role: (typeof AGENT_ROLES)[number];
  state: NodeState;
  index: number;
  reduced: boolean;
}) {
  const isActive = state === "active";
  const isDone = state === "done";

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.25, delay: index * 0.08 }}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2.5 transition-[border-color,background-color,box-shadow] duration-200 sm:gap-3 sm:px-3 sm:py-3 lg:px-4 ${
        isActive
          ? "agent-glow-active border-accent bg-accent/10 shadow-[0_0_24px_-8px_var(--graph-node)]"
          : isDone
            ? "border-accent/40 bg-panel"
            : "border-line bg-panel"
      }`}
    >
      <AgentAvatar
        icon={role.icon}
        state={state}
        floatDelay={index * 0.9}
        reduced={reduced}
        compact
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-semibold tracking-wide text-fg">
          {role.name}
        </p>
        {/* Full job on wide cards; one-line clamp on tighter horizontal layouts */}
        <p className="line-clamp-2 text-[11px] leading-snug text-muted lg:line-clamp-none lg:text-xs">
          {role.job}
        </p>
      </div>
    </motion.div>
  );
}

interface AgentPipelineProps {
  stage: number;
  done: boolean;
}

export default function AgentPipeline({ stage, done }: AgentPipelineProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const nodeState = (i: number): NodeState => {
    const isActive = stage === i && !done;
    const isDone = stage > i || done;
    return isActive ? "active" : isDone ? "done" : "idle";
  };

  return (
    <div className="mt-8 min-w-0" aria-hidden="true">
      {/* Vertical pipeline — narrow viewports */}
      <div className="flex flex-col items-stretch gap-2 md:hidden">
        {AGENT_ROLES.map((role, i) => (
          <div key={role.name} className="flex flex-col items-stretch gap-2">
            <AgentCard
              role={role}
              state={nodeState(i)}
              index={i}
              reduced={prefersReducedMotion}
            />
            {i < AGENT_ROLES.length - 1 && (
              <Connector
                lit={stage > i || done}
                flowing={stage === i + 1 && !done}
                reduced={prefersReducedMotion}
                axis="vertical"
              />
            )}
          </div>
        ))}
      </div>

      {/* Horizontal pipeline — md+; cards & connectors are siblings */}
      <div className="hidden min-w-0 items-center gap-1.5 md:flex md:gap-2">
        {AGENT_ROLES.flatMap((role, i) => {
          const elements = [
            <AgentCard
              key={role.name}
              role={role}
              state={nodeState(i)}
              index={i}
              reduced={prefersReducedMotion}
            />,
          ];
          if (i < AGENT_ROLES.length - 1) {
            elements.push(
              <Connector
                key={`conn-${i}`}
                lit={stage > i || done}
                flowing={stage === i + 1 && !done}
                reduced={prefersReducedMotion}
                axis="horizontal"
              />
            );
          }
          return elements;
        })}
      </div>
    </div>
  );
}
