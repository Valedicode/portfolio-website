/**
 * The shared knowledge base every agent in the demo operates over.
 *
 * All content lives in plain JSON under /data (projects, skills, CV).
 * This module normalizes those three files into one flat list of
 * `KnowledgeEntry` items so the Planner / Retriever / Synthesizer
 * never need to know which file an entry came from.
 */
import cv from "@/data/cv.json";
import projects from "@/data/projects.json";
import skills from "@/data/skills.json";

export type EntryType = "project" | "skill" | "experience" | "education";

export interface KnowledgeEntry {
  id: string;
  type: EntryType;
  title: string;
  description: string;
  tags: string[];
  /** Year used for recency sorting (projects, experience, education). */
  year?: number;
  /** Rough 1–5 scale used for "most complex" style queries (projects only). */
  complexity?: number;
  /** Skill category items, e.g. ["React", "Next.js"] (skills only). */
  items?: string[];
  links?: { repo: string | null; demo: string | null };
  /** Shown by default; non-featured entries sit behind a "show all" toggle. */
  featured?: boolean;
}

export interface ProjectEntry extends KnowledgeEntry {
  type: "project";
  year: number;
  complexity: number;
  links: { repo: string | null; demo: string | null };
}

export const PROJECTS = projects as ProjectEntry[];
export const SKILLS = skills as KnowledgeEntry[];
export const CV = cv;

/** Flat, unified knowledge base: projects + skills + CV entries. */
export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  ...PROJECTS,
  ...SKILLS,
  ...(cv.entries as KnowledgeEntry[]),
];

/** All distinct project tags, most frequent first (used for grid filters). */
export function projectTagCounts(): [string, number][] {
  const counts = new Map<string, number>();
  for (const p of PROJECTS) {
    for (const tag of p.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
