"use client";

/**
 * Consistent section header: a mono index label ("02 / projects") above
 * a large heading, fading in on scroll.
 */
import { motion, useReducedMotion } from "framer-motion";

interface SectionHeadingProps {
  index: string;
  label: string;
  title: string;
}

export default function SectionHeading({ index, label, title }: SectionHeadingProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.3 }}
      className="mb-10"
    >
      <p className="mb-2 font-mono text-xs tracking-widest text-accent">
        {index} / {label}
      </p>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
    </motion.div>
  );
}
