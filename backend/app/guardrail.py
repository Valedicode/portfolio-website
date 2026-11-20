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
    r"disregard (all |any |the )?(previous|prior|above|earlier|your) (instructions|prompts?|rules)",
    r"(reveal|show|print|repeat|output|leak|dump) (me )?(your (system |initial |hidden |original )?(prompt|instructions|rules)|the (initial|hidden|original) (prompt|instructions))",
    r"\byou are now (an?|my|the|in|dan)\b",
    r"\bact as (an? )?(ai|assistant|chatbot|gpt|language model|different|unrestricted|uncensored|dan|jailbroken|evil)\b",
    r"\bact as if\b",
    r"pretend (to be|you are)",
    r"\bjailbreak\b",
    r"\bdan mode\b",
    r"\bdeveloper mode (on|enabled|activated)\b",
    r"</?\s*(system|assistant|instructions?)\s*>",
    r"\[\s*(system|inst)\s*\]",
]

# The input screen blocks only clear requests to *do* something harmful: an
# intent phrase ("how do I", "step by step", "help me") together with a
# harmful action on a harmful object. Mentions alone ("phishing detection",
# "detect weapons in video", "kill a process") pass and are left to the
# Planner, which judges context. High precision matters more than recall
# here: a false block refuses a recruiter's legitimate question.
_W = r"\W+(?:\w+\W+){0,4}?"  # up to four words in between

_INTENT = (
    r"\b(how (do|can|could|would|should|to)|how'?s|ways? to|steps? to|step[- ]by[- ]step"
    r"|instructions?|guide|tutorial|teach me|help me|show me how|tell me how|explain how"
    r"|best way|easiest way|i want to|i need to|i'?m going to|let'?s|(can|could|should|would) i"
    r"|where (can|do|could) (i|one)|wie (kann|baue|mache|bekomme)"
    r"|anleitung)\b"
)

_HARMFUL_ACTIONS = [
    # weapons and explosives
    rf"\b(build|make|assemble|3d[- ]?print|buy|get|obtain|modify|convert|mix|combine|detonate"
    rf"|ignite|baue|bauen|herstellen){_W}"
    r"(bombs?|explosives?|detonators?|grenades?|napalm|thermite|molotov\w*|guns?|firearms?"
    r"|rifles?|pistols?|ammo|ammunition|silencers?|suppressors?|weapons?|bomben?|sprengstoff|waffen?)\b",
    # chemical and biological harm
    r"\b(nerve agents?|sarin|ricin|anthrax|bioweapons?|chemical weapons?|toxic gas|poison gas)\b",
    # violence against people
    rf"\b(kill|murder|assassinate|stab|shoot|torture|kidnap|poison|strangle|hurt|harm|injure|beat up"
    rf"|attack|stalk|töten|umbringen|ermorden){_W}"
    r"(someone|somebody|people|a person|persons?|him|her|them|my \w+|a child|kids?|children|jemanden)\b",
    # drugs
    rf"\b(cook|make|synthes\w*|produce|brew|extract|grow|buy|sell|order|herstellen|kaufen|kochen){_W}"
    r"(meth\w*|cocaine|heroin|fentanyl|lsd|mdma|crack|drugs|drogen)\b",
    # cybercrime
    rf"\b(hack(ing)?|break|get|log)\s+(into|in to){_W}"
    r"(account|accounts|wifi|wi-fi|phone|email|instagram|facebook|computer|network|server)s?\b",
    rf"\b(make|build|write|create|code|deploy|launch|spread|send|run){_W}"
    r"(malware|ransomware|virus|keyloggers?|botnets?|ddos|phishing( emails?| pages?| sites?)?)\b",
    rf"\b(steal|crack|bypass|phish){_W}"
    r"(passwords?|credentials|identit\w*|credit cards?|logins?|2fa|two-factor)\b",
    # fraud
    r"\b(launder\w* (money|cash)|money laundering|tax evasion|evade taxes)\b",
    rf"\b(forge|fake|counterfeit){_W}(documents?|passports?|ids?|id cards?|signatures?|money|banknotes?)\b",
]

# Blocked regardless of phrasing: never a legitimate question here.
_ALWAYS_BLOCKED = [
    rf"\b(child|children|minor|minors|underage|kid|kids)\b{_W}(porn\w*|sex\w*|nudes?|naked|explicit)\b",
    r"\bcsam\b",
    r"\bpipe ?bombs?\b",
]

# Self-harm in the first person, so questions about content moderation or
# research do not get a crisis message by accident.
_SELF_HARM_PATTERNS = [
    r"\b(kill myself|end my life|hurt myself|harm myself|i('?m| am) suicidal|i want to die"
    r"|i don'?t want to live|suicide note)\b",
    r"\b(mich umbringen|ich will sterben|ich will nicht mehr leben)\b",
]

_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)
_INTENT_RE = re.compile(_INTENT, re.IGNORECASE)
_HARMFUL_ACTION_RE = re.compile("|".join(_HARMFUL_ACTIONS), re.IGNORECASE)
_ALWAYS_BLOCKED_RE = re.compile("|".join(_ALWAYS_BLOCKED), re.IGNORECASE)
_SELF_HARM_RE = re.compile("|".join(_SELF_HARM_PATTERNS), re.IGNORECASE)
# Answers only come from the knowledge base, so the output screen looks for
# operational harm (making weapons, drugs, malware), not words like "harm"
# that legitimately describe BiasLens.
_HARMFUL_OUTPUT_RE = re.compile("|".join(_HARMFUL_ACTIONS[:2] + _HARMFUL_ACTIONS[3:]), re.IGNORECASE)


def _is_harmful_request(text: str) -> bool:
    if _ALWAYS_BLOCKED_RE.search(text):
        return True
    return bool(_INTENT_RE.search(text) and _HARMFUL_ACTION_RE.search(text))

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
    if _is_harmful_request(text):
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
    if _HARMFUL_OUTPUT_RE.search(summary) or _ALWAYS_BLOCKED_RE.search(summary):
        raise GuardrailViolation("harmful content in answer", "harmful")
    cleaned = _MARKDOWN_RE.sub("", _URL_RE.sub("", summary))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        raise GuardrailViolation("empty summary")
    if len(cleaned) > MAX_SUMMARY_CHARS:
        cleaned = cleaned[: MAX_SUMMARY_CHARS - 1].rstrip() + "…"
    return cleaned
