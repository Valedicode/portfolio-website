"""Synthesizer agent.

Job: rank the Retriever's candidates according to the Planner's sort
mode, keep the strongest, and write the visitor-facing answer. Its
matched project IDs are what live-filter the frontend's project grid.

Like the Planner, this is a real LLM agent with structured output.
"""

from __future__ import annotations

from langchain_core.language_models.chat_models import BaseChatModel

from ..knowledge import project_ids
from ..schemas import QueryPlan, RetrievalResult, SynthesisOutput

_MAX_CANDIDATES = 12

_SYSTEM_PROMPT = """\
You are the Synthesizer in a three-agent pipeline (Planner -> Retriever -> \
Synthesizer) answering questions about Kevin Ha's portfolio.

Rank the retrieved candidates and answer the visitor. matched_ids must \
only contain candidate ids with type=project. Honor the Planner's sort \
mode: {sort}.\
"""


def _candidate_line(entry: dict, score: int) -> str:
    return (
        f"- id={entry['id']} | type={entry['type']} | score={score} "
        f"| year={entry.get('year', '-')} | complexity={entry.get('complexity', '-')} "
        f"| {entry['title']}: {entry['description']}"
    )


def synthesize(
    llm: BaseChatModel, query: str, plan: QueryPlan, retrieval: RetrievalResult
) -> SynthesisOutput:
    """Ranks candidates and writes the final answer."""
    top = sorted(retrieval.candidates, key=lambda s: s.score, reverse=True)
    top = top[:_MAX_CANDIDATES]
    candidate_text = (
        "\n".join(_candidate_line(s.entry, s.score) for s in top) or "(none)"
    )

    structured_llm = llm.with_structured_output(SynthesisOutput)
    result = structured_llm.invoke(
        [
            ("system", _SYSTEM_PROMPT.format(sort=plan.sort)),
            (
                "human",
                f'Visitor question: "{query}"\n\n'
                f"Planner intent: {plan.trace}\n\n"
                f"Retrieved candidates:\n{candidate_text}",
            ),
        ]
    )
    assert isinstance(result, SynthesisOutput)
    # Guard against hallucinated or non-project IDs.
    result.matched_ids = [i for i in result.matched_ids if i in project_ids()]
    return result
