"""LLM factory: OpenRouter (OpenAI-compatible API) with a cheap default model.

Swapping providers or models is an env-var change, never a code change.
"""

from __future__ import annotations

import os

from langchain_openai import ChatOpenAI

DEFAULT_MODEL = "deepseek/deepseek-chat"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
LLM_TIMEOUT_S = 10
MAX_TOKENS = 600


def llm_configured() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY"))


def build_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", DEFAULT_MODEL),
        base_url=OPENROUTER_BASE_URL,
        api_key=os.environ["OPENROUTER_API_KEY"],
        max_tokens=MAX_TOKENS,
        temperature=0,
        timeout=LLM_TIMEOUT_S,
        max_retries=0,  # a retry doubles the cost of a failing request
    )
