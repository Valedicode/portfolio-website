"use client";

/**
 * Section wrapper that lazy-loads the interactive demo. The dynamic
 * import keeps the pipeline + animation code out of the initial bundle,
 * and the placeholder reserves space so the page doesn't jump.
 */
import dynamic from "next/dynamic";
import SectionHeading from "../SectionHeading";

const AgentDemo = dynamic(() => import("./AgentDemo"), {
  ssr: false,
  loading: () => (
    <div
      className="flex min-h-96 items-center justify-center rounded-xl border border-line bg-panel font-mono text-sm text-muted"
      aria-hidden="true"
    >
      booting agents…
    </div>
  ),
});

export default function AgentDemoSection() {
  return (
    <section id="agents" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionHeading index="02" label="agents" title="Ask my agents" />
      <p className="-mt-6 mb-8 max-w-2xl text-muted">
        A working multi-agent retrieval pipeline over my real CV, projects, and
        skills. Ask a question and watch each role do its job.
      </p>
      <AgentDemo />
    </section>
  );
}
