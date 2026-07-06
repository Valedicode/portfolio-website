"use client";

/**
 * Project cards over data/projects.json, filterable two ways:
 *  - manual tag chips, and
 *  - the agent demo above: when a pipeline run completes, the grid
 *    re-filters to the Synthesizer's ranked project IDs.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PROJECTS, projectTagCounts } from "@/lib/knowledge";
import { useAgents } from "./agent-demo/AgentContext";
import SectionHeading from "./SectionHeading";

/** Manual filter chips: only tags that appear on 2+ projects, capped at 6. */
const FILTER_TAGS = projectTagCounts()
  .filter(([, count]) => count >= 2)
  .slice(0, 6)
  .map(([tag]) => tag);

export default function ProjectGrid() {
  const { run, setRun } = useAgents();
  const prefersReducedMotion = useReducedMotion();
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const agentFiltered = run !== null;

  const projects = useMemo(() => {
    // Agent results win over manual tag filters and keep the agents' ranking.
    if (run) {
      const order = new Map(run.synthesis.projectIds.map((id, i) => [id, i]));
      return PROJECTS.filter((p) => order.has(p.id)).sort(
        (a, b) => order.get(a.id)! - order.get(b.id)!
      );
    }
    if (activeTag) return PROJECTS.filter((p) => p.tags.includes(activeTag));
    return PROJECTS;
  }, [run, activeTag]);

  return (
    <section id="projects" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionHeading index="03" label="projects" title="Selected work" />

      {/* Filter row: agent banner takes over when a run is active */}
      <div className="mb-8 flex min-h-9 flex-wrap items-center gap-2">
        {agentFiltered ? (
          <>
            <span className="font-mono text-xs text-accent" role="status">
              ⚡ filtered by agents · “{run.query}” · {projects.length} match
              {projects.length === 1 ? "" : "es"}
            </span>
            <button
              type="button"
              onClick={() => setRun(null)}
              className="rounded-full border border-line px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-fg"
            >
              Clear
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              aria-pressed={activeTag === null}
              className={`rounded-full px-3 py-1.5 font-mono text-xs transition-colors ${
                activeTag === null
                  ? "bg-accent/15 text-accent"
                  : "border border-line text-muted hover:text-fg"
              }`}
            >
              all
            </button>
            {FILTER_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                aria-pressed={activeTag === tag}
                className={`rounded-full px-3 py-1.5 font-mono text-xs transition-colors ${
                  activeTag === tag
                    ? "bg-accent/15 text-accent"
                    : "border border-line text-muted hover:text-fg"
                }`}
              >
                {tag}
              </button>
            ))}
          </>
        )}
      </div>

      {projects.length === 0 && (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-muted">
          No projects matched — try another question or clear the filter.
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {projects.map((project) => (
            <motion.li
              key={project.id}
              layout={!prefersReducedMotion}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="group relative flex flex-col rounded-xl border border-line bg-panel p-5 transition-colors duration-200 hover:border-accent/60"
            >
              {/* Node dot that "activates" on hover — ties back to the network motif */}
              <span
                className="absolute right-4 top-4 h-1.5 w-1.5 rounded-full bg-line transition-colors duration-200 group-hover:bg-accent"
                aria-hidden="true"
              />
              <div className="flex items-baseline gap-2">
                <h3 className="text-lg font-semibold tracking-tight">
                  {project.title}
                </h3>
                <span className="font-mono text-xs text-muted">{project.year}</span>
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                {project.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {project.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {(project.links.repo || project.links.demo) && (
                <div className="mt-4 flex gap-4 border-t border-line pt-3">
                  {project.links.repo && (
                    <a
                      href={project.links.repo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-accent hover:text-accent-bright"
                    >
                      repo ↗
                    </a>
                  )}
                  {project.links.demo && (
                    <a
                      href={project.links.demo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-accent hover:text-accent-bright"
                    >
                      live ↗
                    </a>
                  )}
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
