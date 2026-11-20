"""Deterministic guardrails for the public demo endpoint.

Cheap checks that run without an LLM. The semantic guard is the Planner
(scope classification, see agents/planner.py); these catch what must never
depend on a model:

1. Input screen, before any tokens are spent: invalid text, prompt-injection
   phrasing, and clearly harmful requests (weapons, explosives, drugs,
   violence, cybercrime, fraud, sexual content involving minors, self-harm).
   High precision on purpose: anything subtler is left to the Planner.
2. `wrap_untrusted` fences visitor text so the agents treat it as data.
3. Output screen: cap the summary, strip links, block prompt leaks and
   harmful content in the answer.

A blocked request gets a fixed, polite refusal (never model-written text).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Literal

MAX_SUMMARY_CHARS = 700  # room for a fluent 2-4 sentence answer

Verdict = Literal["off_topic", "harmful", "self_harm"]

REFUSALS: dict[Verdict, str] = {
    "off_topic": (
        "I can only answer questions about Kevin's work: his projects, skills, "
        "studies and experience. Try asking what he has built with Python, or "
        "where he has worked."
    ),
    "harmful": (
        "I can't help with that. I'm only here to answer questions about "
        "Kevin's projects, skills and experience."
    ),
    "self_harm": (
        "I can't help with that here, as I can only answer questions about "
        "Kevin's work. If you are going through a hard time, please reach out "
        "to someone you trust or a crisis line: in Germany, the "
        "Telefonseelsorge is free and available around the clock at "
        "0800 111 0 111, and elsewhere your local emergency number can help."
    ),
}

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

# Phrases, not single words: the knowledge base itself mentions e.g.
# "security" and "password" (TOTP Generator), which must stay askable.
_HARMFUL_PATTERNS = [
    # weapons and explosives
    r"\b(pipe ?)?bombs?\b", r"\bexplosives?\b", r"\bdetonators?\b", r"\bgrenades?\b",
    r"\bnapalm\b", r"\bthermite\b", r"\bmolotov\b", r"\bweapons?\b",
    r"\b(build|make|3d[- ]?print|buy|get|modify)\b.{0,30}\b(guns?|firearms?|rifles?|pistols?|ammo|ammunition|silencers?|suppressors?)\b",
    r"\b(nerve agents?|sarin|ricin|anthrax|bioweapons?)\b",
    # violence
    r"\b(kill|murder|assassinate|stab|shoot|torture|kidnap|poison|strangle)\b.{0,30}\b(someone|somebody|people|person|him|her|them|my|a|the|neighbou?rs?)\b",
    r"\b(hurt|harm|injure|beat up)\b.{0,15}\b(someone|somebody|people|a person|him|her|them)\b",
    r"\b(terror(ist|ism)|massacre|genocide|mass shooting)\b",
    # drugs
    r"\b(cook|make|synthes\w*|produce|brew|extract)\b.{0,30}\b(meth\w*|cocaine|heroin|fentanyl|lsd|mdma|crack cocaine)\b",
    r"\b(buy|sell|order|get)\b.{0,20}\b(drugs|cocaine|heroin|meth|fentanyl)\b",
    # cybercrime
    r"\bhack(ing)? (into|someone|my (ex|neighbou?r))", r"\bddos\b", r"\bransomware\b",
    r"\bkeyloggers?\b", r"\bbotnets?\b", r"\bphishing\b",
    r"\b(steal|crack|bypass)\w*\b.{0,20}\b(passwords?|credentials|accounts?|identit\w*|wi-?fi)\b",
    r"\bcredit card (fraud|numbers?)\b", r"\bcarding\b",
    # fraud and other crime
    r"\b(money laundering|launder (money|cash)|counterfeit\w*|tax evasion)\b",
    r"\bforg(e|ing) (documents?|passports?|ids?|signatures?)\b",
    # sexual content involving minors
    r"\b(child|minor|underage|kid)s?\b.{0,20}\b(porn\w*|sex\w*|nudes?|naked)\b", r"\bcsam\b",
    # German equivalents of the clearest cases
    r"\b(bombe|sprengstoff|waffe[n]?)\b", r"\b(töten|umbringen|ermorden)\b",
    r"\bdrogen (herstellen|kaufen|kochen)\b",
]

_SELF_HARM_PATTERNS = [
    r"\b(suicide|suicidal|kill myself|end my life|self[- ]?harm|hurt myself)\b",
    r"\b(selbstmord|suizid|mich umbringen)\b",
]

_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)
_HARMFUL_RE = re.compile("|".join(_HARMFUL_PATTERNS), re.IGNORECASE)
_SELF_HARM_RE = re.compile("|".join(_SELF_HARM_PATTERNS), re.IGNORECASE)

_LEAK_MARKERS = ("you are the planner", "you are the synthesizer", "visitor_question")
_URL_RE = re.compile(r"(https?://|www\.)\S+", re.IGNORECASE)
# The page renders plain text; models add markdown despite being told not to.
_MARKDOWN_RE = re.compile(r"\*\*|__|`|^\s*(#{1,6}|[-*•])\s+", re.MULTILINE)


class GuardrailViolation(ValueError):
    """The request or response was blocked; `verdict` picks the refusal."""

    def __init__(self, reason: str, verdict: Verdict = "off_topic") -> None:
        super().__init__(reason)
        self.verdict: Verdict = verdict


def check_input(query: str) -> str:
    """Normalises the visitor query or raises GuardrailViolation."""
    text = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", query)).strip()
    if not text:
        raise GuardrailViolation("empty query")
    if any(unicodedata.category(c) in ("Cc", "Cf") for c in text):
        raise GuardrailViolation("control characters")
    if _SELF_HARM_RE.search(text):
        raise GuardrailViolation("self-harm", "self_harm")
    if _HARMFUL_RE.search(text):
        raise GuardrailViolation("harmful request", "harmful")
    if _INJECTION_RE.search(text):
        raise GuardrailViolation("prompt-injection pattern")
    return text


def wrap_untrusted(query: str) -> str:
    """Fences visitor text so the model treats it as data, not instructions."""
    return f"<visitor_question>\n{query}\n</visitor_question>"


def check_output(summary: str) -> str:
    """Sanitises the model's visitor-facing summary or raises."""
    lowered = summary.lower()
    if any(marker in lowered for marker in _LEAK_MARKERS):
        raise GuardrailViolation("possible system-prompt leak")
    if _HARMFUL_RE.search(summary):
        raise GuardrailViolation("harmful content in answer", "harmful")
    cleaned = _MARKDOWN_RE.sub("", _URL_RE.sub("", summary))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        raise GuardrailViolation("empty summary")
    if len(cleaned) > MAX_SUMMARY_CHARS:
        cleaned = cleaned[: MAX_SUMMARY_CHARS - 1].rstrip() + "…"
    return cleaned
