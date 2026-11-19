"""Pydantic schemas shared across the agent pipeline.

QueryPlan and SynthesisOutput double as LangChain structured-output
schemas — their field descriptions are part of the prompt the LLM sees.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

EntryType = Literal["project", "skill", "experience", "education"]
SortMode = Literal["relevance", "recency", "complexity"]


class QueryPlan(BaseModel):
    """Structured intent the Planner extracts from a visitor question."""

    tags: list[str] = Field(
        description="Canonical knowledge-base tags matching the question"
    )
    keywords: list[str] = Field(
        description="Leftover free-text keywords for fuzzy matching"
    )
    types: Optional[list[EntryType]] = Field(
        description="Restrict results to these entry types, or null for any"
    )
    sort: SortMode = Field(description="How the final results should be ordered")
    trace: str = Field(
        description="Terse log line, at most 15 words, e.g. 'tag=fastapi, sort=relevance'"
    )


class SynthesisOutput(BaseModel):
    """The Synthesizer's ranking decision and visitor-facing answer."""

    matched_ids: list[str] = Field(
        description="IDs of matching PROJECT entries, best first, max 6, may be empty"
    )
    summary: str = Field(
        description=(
            "2-4 sentence conversational answer in plain prose that names "
            "the specific projects or roles and why they fit"
        )
    )
    trace: str = Field(
        description="Terse log line, at most 15 words, e.g. 'ranked 4 by relevance, kept 3'"
    )


class ScoredEntry(BaseModel):
    """A knowledge-base entry with the Retriever's match score attached."""

    entry: dict
    score: int


class RetrievalResult(BaseModel):
    candidates: list[ScoredEntry]
    trace: str


class AgentDemoRequest(BaseModel):
    query: str = Field(min_length=1, max_length=300)


class AgentDemoResponse(BaseModel):
    """Contract the frontend expects — field names are part of the API."""

    plannerTrace: str
    retrieverTrace: str
    synthesizerTrace: str
    summary: str
    matchedIds: list[str]
