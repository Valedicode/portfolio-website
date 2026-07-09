"use client";

/**
 * Skills as a set of hub-and-spoke mini-graphs — one per category from
 * data/skills.json — echoing the site's agent-network motif. Edges draw
 * in and nodes pop as each card scrolls into view.
 */
import { motion, useReducedMotion } from "framer-motion";
import { SKILLS } from "@/lib/knowledge";
import SectionHeading from "./SectionHeading";

const VIEW_W = 320;
const VIEW_H = 150;
const HUB = { x: VIEW_W / 2, y: 28 };
const ITEM_Y = 104;

/** Evenly spaces n items across the bottom of the viewBox. */
function itemX(index: number, total: number): number {
  const margin = 40;
  if (total === 1) return VIEW_W / 2;
  return margin + (index * (VIEW_W - margin * 2)) / (total - 1);
}

function ClusterGraph({
  title,
  items,
  animate,
}: {
  title: string;
  items: string[];
  animate: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full"
      role="img"
      aria-label={`${title}: ${items.join(", ")}`}
    >
      {items.map((item, i) => {
        const x = itemX(i, items.length);
        const delay = 0.15 + i * 0.07;
        return (
          <g key={item}>
            <motion.line
              x1={HUB.x}
              y1={HUB.y}
              x2={x}
              y2={ITEM_Y}
              className="skill-graph-edge"
              stroke="var(--graph-stroke)"
              strokeWidth="1.8"
              initial={animate ? { pathLength: 0, opacity: 0 } : false}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay }}
            />
            <motion.circle
              cx={x}
              cy={ITEM_Y}
              r="5.5"
              className="skill-graph-node"
              fill="var(--graph-node)"
              initial={animate ? { scale: 0, opacity: 0 } : false}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: delay + 0.1 }}
              style={{ transformOrigin: `${x}px ${ITEM_Y}px` }}
            />
            <motion.text
              x={x}
              y={ITEM_Y + 22}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize="10"
              fontFamily="var(--font-mono)"
              initial={animate ? { opacity: 0 } : false}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: delay + 0.1 }}
            >
              {item}
            </motion.text>
          </g>
        );
      })}
      {/* Hub node drawn last so it sits above the edges */}
      <circle
        cx={HUB.x}
        cy={HUB.y}
        r="9"
        className="skill-graph-hub"
        fill="var(--panel)"
        stroke="var(--graph-stroke)"
        strokeWidth="2.2"
      />
      <circle
        cx={HUB.x}
        cy={HUB.y}
        r="4"
        className="skill-graph-hub-core"
        fill="var(--graph-node)"
      />
    </svg>
  );
}

export default function SkillsGraph() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section id="skills" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionHeading index="04" label="skills" title="Tech stack" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SKILLS.map((category, i) => (
          <motion.div
            key={category.id}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.25, delay: (i % 3) * 0.06 }}
            className="rounded-xl border border-line bg-panel p-5"
          >
            <h3 className="mb-1 font-mono text-sm font-semibold text-fg">
              {category.title}
            </h3>
            <ClusterGraph
              title={category.title}
              items={category.items ?? []}
              animate={!prefersReducedMotion}
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
