"""Loads the shared knowledge base the agents operate over.

The single source of truth is the frontend's /data folder (cv.json,
projects.json, skills.json) — the same files that drive the client-side
simulated pipeline — so both tiers always answer from identical data.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "frontend" / "data"


def _data_dir() -> Path:
    return Path(os.getenv("KNOWLEDGE_DIR", _DEFAULT_DATA_DIR))


def _load(filename: str) -> Any:
    with open(_data_dir() / filename, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def knowledge_base() -> list[dict]:
    """Flat, unified knowledge base: projects + skills + CV entries."""
    projects: list[dict] = _load("projects.json")
    skills: list[dict] = _load("skills.json")
    cv: dict = _load("cv.json")
    return [*projects, *skills, *cv["entries"]]


# `period` matters: without it the model cannot tell an ongoing exchange
# semester from a finished one.
_PROMPT_FIELDS = (
    "id", "type", "title", "description", "tags", "period", "year", "complexity",
)


@lru_cache(maxsize=1)
def knowledge_base_json() -> str:
    """The whole knowledge base as compact JSON for a prompt (~3k tokens)."""
    rows = [{k: e[k] for k in _PROMPT_FIELDS if k in e} for e in knowledge_base()]
    return json.dumps(rows, ensure_ascii=False, separators=(",", ":"))


@lru_cache(maxsize=1)
def profile_json() -> str:
    """Who Kevin is and the personal basics a visitor may ask about."""
    cv: dict = _load("cv.json")
    profile = {
        "name": cv["name"],
        "role": cv["role"],
        "location": cv["location"],
        "about": cv["bio"],
        **cv["profile"],
    }
    return json.dumps(profile, ensure_ascii=False, separators=(",", ":"))


@lru_cache(maxsize=1)
def all_tags() -> list[str]:
    """Every distinct tag in the knowledge base (used to ground the Planner)."""
    seen: dict[str, None] = {}
    for entry in knowledge_base():
        for tag in entry.get("tags", []):
            seen[tag] = None
    return list(seen)


@lru_cache(maxsize=1)
def project_ids() -> frozenset[str]:
    """IDs of project entries — the only IDs the Synthesizer may return."""
    return frozenset(e["id"] for e in knowledge_base() if e["type"] == "project")
