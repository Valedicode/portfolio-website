"use client";

/**
 * Hero: name, tagline, and the ambient agent-network canvas behind it.
 */
import { motion, useReducedMotion } from "framer-motion";
import { CV } from "@/lib/knowledge";
import NetworkCanvas from "./NetworkCanvas";

export default function Hero() {
  const prefersReducedMotion = useReducedMotion();

  const fadeUp = (delay: number) => ({
    initial: prefersReducedMotion ? undefined : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay },
  });

  return (
    <section id="top" className="relative flex min-h-svh items-center overflow-hidden">
      <NetworkCanvas />
      {/* Soft radial fade so text stays readable over the network */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--bg)_0%,transparent_75%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 py-28 sm:px-6">
        <motion.p {...fadeUp(0)} className="mb-4 font-mono text-sm text-accent">
          {CV.role}
        </motion.p>
        <motion.h1
          {...fadeUp(0.08)}
          className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl"
        >
          {CV.name}
          <span className="text-accent">.</span>
          <span className="mt-3 block text-2xl font-normal text-muted sm:text-4xl">
            {CV.tagline}
          </span>
        </motion.h1>

        <motion.div {...fadeUp(0.16)} className="mt-10 flex flex-wrap gap-3">
          <a
            href="#projects"
            className="rounded-lg bg-accent px-6 py-3 font-mono text-sm font-medium text-bg transition-colors hover:bg-accent-bright"
          >
            View Projects
          </a>
          <a
            href="/Resume.pdf"
            download
            className="rounded-lg border border-line px-6 py-3 font-mono text-sm text-fg transition-colors hover:border-accent"
          >
            Download Resume
          </a>
        </motion.div>

        <motion.p
          {...fadeUp(0.24)}
          className="mt-16 font-mono text-xs text-muted"
          aria-hidden="true"
        >
          ↓ scroll — or ask the agents below
        </motion.p>
      </div>
    </section>
  );
}
