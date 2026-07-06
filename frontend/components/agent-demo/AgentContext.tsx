"use client";

/**
 * Shared state between the AgentDemo and the rest of the page:
 *  - the ProjectGrid live-filters itself from `run.synthesis.projectIds`
 *  - the nav's status pill reflects `status` ("3 agents idle/active")
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { PipelineRun } from "./types";

export type AgentStatus = "idle" | "working";

interface AgentContextValue {
  /** Last completed pipeline run, or null when nothing is filtered. */
  run: PipelineRun | null;
  setRun: (run: PipelineRun | null) => void;
  status: AgentStatus;
  setStatus: (status: AgentStatus) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [status, setStatus] = useState<AgentStatus>("idle");

  const value = useMemo(
    () => ({ run, setRun, status, setStatus }),
    [run, status]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgents(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgents must be used inside <AgentProvider>");
  return ctx;
}
