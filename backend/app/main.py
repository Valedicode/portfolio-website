"""FastAPI app exposing the LangChain multi-agent pipeline.

POST /agent-demo runs Planner (LLM) -> Retriever (deterministic) ->
Synthesizer (LLM) over the shared knowledge base and returns per-agent
traces plus the matched project IDs.

The Next.js frontend calls this through its own server route
(frontend/app/api/agent-demo/route.ts), which adds the shared secret and the
visitor's IP. Any non-200 response makes the frontend fall back to its
client-side rule-based pipeline, so this service can never break the demo,
only upgrade it.

Request order (cheapest check first, LLM last):
  shared secret -> input guardrail -> rate limits -> LLM pipeline -> output guardrail

Run:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

from .agents.planner import plan
from .agents.retriever import retrieve
from .agents.synthesizer import synthesize
from .guardrail import GuardrailViolation, check_input, check_output
from .llm import build_llm, llm_configured
from .schemas import AgentDemoRequest, AgentDemoResponse
from .security import client_ip, enforce_limits, require_internal_key

load_dotenv()

logger = logging.getLogger("agent-demo")

# No CORS middleware on purpose: the browser only ever talks to the Next.js
# origin; this service is called server-to-server.
app = FastAPI(title="Portfolio Agent Backend", version="1.1.0")


TRACE_MAX_CHARS = 140


def _clip(trace: str) -> str:
    """Keeps model-written log lines one line long, whatever the model does."""
    line = " ".join(trace.split())
    return line if len(line) <= TRACE_MAX_CHARS else line[: TRACE_MAX_CHARS - 1] + "…"


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llm_configured": llm_configured()}


@app.post(
    "/agent-demo",
    response_model=AgentDemoResponse,
    dependencies=[Depends(require_internal_key)],
)
def agent_demo(body: AgentDemoRequest, request: Request) -> AgentDemoResponse:
    if not llm_configured():
        raise HTTPException(status_code=503, detail="LLM mode not configured")

    try:
        query = check_input(body.query)
    except GuardrailViolation as violation:
        logger.info("input blocked: %s", violation)
        raise HTTPException(status_code=400, detail="Query not allowed")

    enforce_limits(client_ip(request))

    llm = build_llm()
    try:
        query_plan = plan(llm, query)
        retrieval = retrieve(query_plan)
        synthesis = synthesize(llm, query, query_plan, retrieval)
        summary = check_output(synthesis.summary)
    except GuardrailViolation as violation:
        logger.warning("output blocked: %s", violation)
        raise HTTPException(status_code=502, detail="Response blocked")
    except Exception:
        logger.exception("agent pipeline failed")
        raise HTTPException(status_code=502, detail="LLM pipeline failed")

    return AgentDemoResponse(
        plannerTrace=_clip(query_plan.trace),
        retrieverTrace=retrieval.trace,
        synthesizerTrace=_clip(synthesis.trace),
        summary=summary,
        matchedIds=synthesis.matched_ids,
    )
