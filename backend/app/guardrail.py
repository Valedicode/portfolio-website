"""Input and output guardrails for the public demo endpoint.

Layered and deliberately cheap (no extra LLM call):

1. Input guardrail: reject control characters and obvious prompt-injection
   or off-purpose phrasing *before* any tokens are spent.
2. Prompt hardening: `wrap_untrusted` fences the visitor text so the agents
   treat it as data (see the agent system prompts).
3. Output guardrail: cap the summary, strip links, and refuse answers that
   look like a leaked system prompt.

A rejected request returns an error status; the frontend then answers with
its free rule-based pipeline, so a blocked visitor still gets a result.
"""

from __future__ import annotations

import re
import unicodedata

MAX_SUMMARY_CHARS = 400

_INJECTION_PATTERNS = [
    r"ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)",
    r"disregard (all |any |the )?(previous|prior|above|earlier|your)",
    r"(reveal|show|print|repeat|output|leak) (me )?(your|the) (system |initial |hidden )?(prompt|instructions|rules)",
    r"you are now\b",
    r"\bact as\b",
    r"pretend (to be|you are)",
    r"\bjailbreak\b",
    r"\bdan mode\b",
    r"developer mode",
    r"</?\s*(system|assistant|instructions?)\s*>",
    r"\[\s*(system|inst)\s*\]",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)

_LEAK_MARKERS = ("three-agent pipeline", "matched_ids must", "sort mode:")
_URL_RE = re.compile(r"(https?://|www\.)\S+", re.IGNORECASE)


class GuardrailViolation(ValueError):
    """The request or response was blocked by a guardrail."""


def check_input(query: str) -> str:
    """Normalises the visitor query or raises GuardrailViolation."""
    text = unicodedata.normalize("NFKC", query).strip()
    if not text:
        raise GuardrailViolation("empty query")
    if any(unicodedata.category(c) in ("Cc", "Cf") and c not in "\n\t" for c in text):
        raise GuardrailViolation("control characters")
    if _INJECTION_RE.search(text):
        raise GuardrailViolation("prompt-injection pattern")
    return re.sub(r"\s+", " ", text)


def wrap_untrusted(query: str) -> str:
    """Fences visitor text so the model treats it as data, not instructions."""
    return f"<visitor_question>\n{query}\n</visitor_question>"


def check_output(summary: str) -> str:
    """Sanitises the model's visitor-facing summary or raises."""
    lowered = summary.lower()
    if any(marker in lowered for marker in _LEAK_MARKERS):
        raise GuardrailViolation("possible system-prompt leak")
    cleaned = _URL_RE.sub("", summary).strip()
    if not cleaned:
        raise GuardrailViolation("empty summary")
    if len(cleaned) > MAX_SUMMARY_CHARS:
        cleaned = cleaned[: MAX_SUMMARY_CHARS - 1].rstrip() + "…"
    return cleaned
