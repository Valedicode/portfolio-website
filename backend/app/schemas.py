"""Pydantic schemas shared across the agent pipeline.

PlannerOutput and SynthesisOutput double as LangChain structured-output
schemas: their field descriptions are part of the prompt the LLM sees, and
they are kept minimal because output tokens are what cost latency. Log
traces are written by code from these fields, never by the model.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

EntryType = Literal["project", "skill", "experience", "education"]
SortMode = Literal["relevance", "recency", "complexity"]
Scope = Literal["portfolio", "off_topic", "harmful", "self_harm"]


class PlannerOutput(BaseModel):
    """What the Planner (router and guard) returns. Scope comes first."""

    scope: Scope = Field(description="Whether the question may be answered at all")
    types: Optional[list[EntryType]] = Field(
        description="Entry kinds the question asks about, or null for several"
    )
    sort: SortMode = Field(description="How results should be ordered")
    tags: list[str] = Field(
        description="Knowledge-base tags the question names explicitly, else empty"
    )


class QueryPlan(BaseModel):
    """Structured intent the Retriever matches against the knowledge base."""

    tags: list[str]
    keywords: list[str]
    types: Optional[list[EntryType]]
    sort: SortMode
    trace: str


class SynthesisOutput(BaseModel):
    """The Synthesizer's answer and the projects it is about."""

    matched_ids: list[str] = Field(
        description="IDs of the PROJECT entries the answer is about, best first, max 6"
    )
    summary: str = Field(
        description=(
            "2-3 sentence conversational answer in plain prose that names "
            "the specific projects or roles and why they fit"
        )
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
    # True when the request was refused; the summary is then a fixed message.
    declined: bool = False
