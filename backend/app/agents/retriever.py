"""Retriever agent.

Job: take the Planner's structured QueryPlan and score every entry in
the shared knowledge base against it. Deliberately deterministic — all
query understanding happened in the Planner; this role only does
matching: tag overlap, keyword hits, and type filtering.

Direct port of the frontend's retriever.ts (same weights, same widening
behavior) so both tiers retrieve identically.
"""

from __future__ import annotations

from ..knowledge import knowledge_base
from ..schemas import QueryPlan, RetrievalResult, ScoredEntry

# Score weights: exact tag matches are the strongest signal, then title
# keywords, then description/skill-item keywords.
WEIGHT_TAG = 3
WEIGHT_TITLE = 2
WEIGHT_TEXT = 1


def _score_entry(entry: dict, plan: QueryPlan) -> int:
    score = 0

    for tag in plan.tags:
        if tag in entry.get("tags", []):
            score += WEIGHT_TAG

    title = entry["title"].lower()
    text = (entry["description"] + " " + " ".join(entry.get("items", []))).lower()

    for keyword in plan.keywords:
        kw = keyword.lower()
        if kw in title:
            score += WEIGHT_TITLE
        elif kw in text:
            score += WEIGHT_TEXT

    return score


def _scan_pool(pool: list[dict], plan: QueryPlan) -> list[ScoredEntry]:
    has_signal = bool(plan.tags or plan.keywords)
    scored = [ScoredEntry(entry=e, score=_score_entry(e, plan)) for e in pool]
    # With no usable signal (e.g. "show me everything"), keep the whole
    # pool at neutral score and let the Synthesizer sort it.
    return [s for s in scored if s.score > 0] if has_signal else scored


def retrieve(plan: QueryPlan) -> RetrievalResult:
    """Matches the plan against the knowledge base and returns scored candidates."""
    base = knowledge_base()
    pool = [e for e in base if e["type"] in plan.types] if plan.types else base

    candidates = _scan_pool(pool, plan)
    widened = False

    # If the type filter eliminated everything but the query had real
    # signal, widen to the full knowledge base rather than returning
    # nothing — a retrieval agent relaxing its constraints.
    if not candidates and plan.types and len(pool) < len(base):
        candidates = _scan_pool(base, plan)
        widened = bool(candidates)

    # "Most complex/recent ..." questions are about an ordering, not a topic.
    # If the leftover keywords match nothing, rank the whole pool instead of
    # returning nothing.
    ranked_all = False
    if not candidates and plan.sort != "relevance":
        candidates = [ScoredEntry(entry=e, score=0) for e in pool]
        ranked_all = True

    scanned = len(base) if widened else len(pool)
    plural = "" if len(candidates) == 1 else "s"
    widened_note = " (widened: type filter too strict)" if widened else ""
    if ranked_all:
        widened_note = f" (no topic match: ranking all by {plan.sort})"
    return RetrievalResult(
        candidates=candidates,
        trace=(
            f"scanned {scanned} entries{widened_note} → {len(candidates)} "
            f"candidate{plural} (tag +{WEIGHT_TAG}, title +{WEIGHT_TITLE}, text +{WEIGHT_TEXT})"
        ),
    )
