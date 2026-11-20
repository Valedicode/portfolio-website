"""Verifier: deterministic grounding of the Synthesizer's result.

No LLM. Turns the Synthesizer's draft into the project list that filters
the grid, combining the model's judgement with exact data:

1. keep only picks that are real project ids (drops hallucinations)
2. add projects the answer names but did not pick, so grid and text agree
3. add exact tag matches from the Retriever that the model left out, when
   the question is about projects (models under-list long result sets)
4. order by the Planner's sort mode using the real complexity/year fields,
   which models apply inconsistently
"""

from __future__ import annotations

import re

from ..knowledge import knowledge_base
from ..schemas import QueryPlan, RetrievalResult, SynthesisOutput
from .retriever import WEIGHT_TAG

MAX_PROJECTS = 6


def _projects() -> dict[str, dict]:
    return {e["id"]: e for e in knowledge_base() if e["type"] == "project"}


def _named_in(summary: str, projects: dict[str, dict]) -> list[str]:
    return [
        pid
        for pid, e in projects.items()
        if re.search(rf"\b{re.escape(e['title'])}\b", summary, re.IGNORECASE)
    ]


def finalize(
    plan: QueryPlan, retrieval: RetrievalResult, synthesis: SynthesisOutput
) -> tuple[list[str], str]:
    """Returns the verified project ids and a one-line log of what changed."""
    projects = _projects()

    picks = list(dict.fromkeys(i for i in synthesis.matched_ids if i in projects))
    dropped = len(set(synthesis.matched_ids)) - len(picks)

    named = [i for i in _named_in(synthesis.summary, projects) if i not in picks]

    # Only when the Planner says the question is about projects; otherwise a
    # question about, say, research or a job would drag unrelated cards in.
    about_projects = bool(plan.types) and "project" in plan.types
    exact: list[str] = []
    if plan.tags and about_projects:
        taken = set(picks) | set(named)
        exact = [
            s.entry["id"]
            for s in retrieval.candidates
            if s.entry["id"] in projects and s.score >= WEIGHT_TAG
            and s.entry["id"] not in taken
        ]

    ids = picks + named + exact
    if plan.sort == "complexity":
        ids.sort(key=lambda i: (projects[i].get("complexity", 0), projects[i].get("year", 0)), reverse=True)
    elif plan.sort == "recency":
        ids.sort(key=lambda i: (projects[i].get("year", 0), projects[i].get("complexity", 0)), reverse=True)
    ids = ids[:MAX_PROJECTS]

    parts = [f"{len(picks)} picks"]
    if named:
        parts.append(f"+{len(named)} named in answer")
    if exact:
        parts.append(f"+{len(exact)} exact tag matches")
    if dropped:
        parts.append(f"{dropped} invalid dropped")
    if plan.sort != "relevance":
        parts.append(f"ordered by {plan.sort}")
    return ids, f"verified grid: {', '.join(parts)} → {len(ids)} projects"
