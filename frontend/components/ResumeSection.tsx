"use client";

/**
 * Resume: prominent PDF download plus a compact highlights timeline
 * (education + experience from data/cv.json) for visitors who don't
 * want to open the PDF.
 */
import { motion, useReducedMotion } from "framer-motion";
import { CV, type KnowledgeEntry } from "@/lib/knowledge";
import SectionHeading from "./SectionHeading";

interface TimelineEntry extends KnowledgeEntry {
  period?: string;
}

const HIGHLIGHTS = (CV.entries as TimelineEntry[]).filter((e) =>
  ["education", "experience"].includes(e.type)
);

export default function ResumeSection() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section id="resume" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionHeading index="05" label="resume" title="Background" />

      <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.3 }}
          className="h-fit rounded-xl border border-line bg-panel p-6"
        >
          <p className="font-mono text-xs tracking-widest text-accent">CV.pdf</p>
          <p className="mt-2 text-sm text-muted">
            Full curriculum vitae — education, experience, projects, and skills
            in one document.
          </p>
          <a
            href="/CV.pdf"
            download
            className="mt-5 inline-block rounded-lg bg-accent px-6 py-3 font-mono text-sm font-medium text-bg transition-colors hover:bg-accent-bright"
          >
            Download CV ↓
          </a>
        </motion.div>

        <ol className="relative space-y-6 border-l border-line ps-6">
          {HIGHLIGHTS.map((entry, i) => (
            <motion.li
              key={entry.id}
              initial={prefersReducedMotion ? false : { opacity: 0, x: 12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.25, delay: i * 0.06 }}
              className="relative"
            >
              {/* Timeline node */}
              <span
                className="absolute -start-[31px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-accent bg-bg"
                aria-hidden="true"
              />
              <p className="font-mono text-xs text-muted">{entry.period}</p>
              <h3 className="mt-1 font-semibold">{entry.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {entry.description}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
