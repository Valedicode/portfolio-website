"use client";

/**
 * Short narrative bio plus a few real stat callouts, sourced from data/cv.json.
 */
import { motion, useReducedMotion } from "framer-motion";
import { CV } from "@/lib/knowledge";
import SectionHeading from "./SectionHeading";

export default function About() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section id="about" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionHeading index="01" label="about" title="How I think about problems" />

      <div className="grid gap-12 lg:grid-cols-[2fr_1fr]">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.3 }}
          className="space-y-5 text-base leading-relaxed text-muted sm:text-lg"
        >
          {CV.bio.map((paragraph, i) => (
            <p key={i} className={i === 0 ? "text-fg" : undefined}>
              {paragraph}
            </p>
          ))}
        </motion.div>

        <div className="grid content-start gap-4 sm:grid-cols-3 lg:grid-cols-1">
          {CV.stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.25, delay: i * 0.08 }}
              className="rounded-xl border border-line bg-panel p-5"
            >
              <p className="font-mono text-3xl font-semibold text-accent">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-muted">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
