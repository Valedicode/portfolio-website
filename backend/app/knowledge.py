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

_BACKEND_DIR = Path(__file__).resolve().parents[1]
# A deploy copies frontend/data to backend/data (the Vercel project is rooted
# at backend/, so ../frontend is not in the function bundle). Locally the
# monorepo path is used, so there is still a single source of truth.
_BUNDLED_DATA_DIR = _BACKEND_DIR / "data"
_MONOREPO_DATA_DIR = _BACKEND_DIR.parent / "frontend" / "data"


def _data_dir() -> Path:
    override = os.getenv("KNOWLEDGE_DIR")
    if override:
        return Path(override)
    return _BUNDLED_DATA_DIR if _BUNDLED_DATA_DIR.is_dir() else _MONOREPO_DATA_DIR


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
