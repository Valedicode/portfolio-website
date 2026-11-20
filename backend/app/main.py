"""FastAPI app exposing the agent pipeline.

POST /agent-demo answers a visitor question about Kevin's portfolio:

    input screen (regex, instant)
        │
        ├── Planner (LLM, tiny output) ── Retriever (deterministic)
        │        router + semantic guard        exact matches for the plan
        │                                              │
        └── Synthesizer (LLM, whole knowledge base) ───┴── Verifier (deterministic)
                 starts at the same time                   grounds ids, orders, checks output

The Planner and Synthesizer run in parallel, so a request costs one LLM
round trip of latency, not two. If the Planner rules the question out, the
Synthesizer's draft is cancelled and a fixed refusal is returned.
backend/evals measures this design against a single zero-shot call.

The Next.js frontend calls this through its own server route
(frontend/app/api/agent-demo/route.ts), which adds the shared secret and the
visitor's IP. Any non-200 response makes the frontend fall back to its
client-side rule-based pipeline, so this service can never break the demo.

Run:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import asyncio
import logging
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from .agents.planner import plan
from .agents.retriever import retrieve
from .agents.synthesizer import synthesize
from .agents.verifier import finalize
from .guardrail import REFUSALS, GuardrailViolation, Verdict, check_input, check_output
from .knowledge import knowledge_base
from .llm import build_llm, llm_configured
from .schemas import AgentDemoRequest, AgentDemoResponse
from .security import client_ip, enforce_limits, require_internal_key

load_dotenv()

logger = logging.getLogger("agent-demo")

# No CORS middleware on purpose: the browser only ever talks to the Next.js
# origin; this service is called server-to-server.
app = FastAPI(title="Portfolio Agent Backend", version="2.0.0")

TRACE_MAX_CHARS = 160
# The Synthesizer usually answers in ~2s; a slow provider response can take
# 3x that. Past this point a duplicate request is sent and the first answer
# wins ("hedged request"), which cuts the tail at the cost of rare extra calls.
HEDGE_AFTER_S = 3.0


def _clip(trace: str) -> str:
    """Keeps every log line one line long."""
    line = " ".join(trace.split())
    return line if len(line) <= TRACE_MAX_CHARS else line[: TRACE_MAX_CHARS - 1] + "…"


def _declined(verdict: Verdict, planner_trace: str) -> AgentDemoResponse:
    return AgentDemoResponse(
        plannerTrace=_clip(planner_trace),
        retrieverTrace="skipped: request declined",
        synthesizerTrace="skipped: fixed refusal sent instead of a model answer",
        summary=REFUSALS[verdict],
        matchedIds=[],
        declined=True,
    )


def _discard(task: asyncio.Task) -> None:
    """Cancels a background task and swallows whatever it ends with."""
    task.cancel()
    task.add_done_callback(lambda t: t.cancelled() or t.exception())


async def _hedged(first: asyncio.Task, start_again, wait_s: float) -> tuple[object, str]:
    """Awaits `first`. If it fails fast, retries once; if it is slow, races a
    duplicate and keeps whichever answers first. Returns (result, note)."""
    done, _ = await asyncio.wait({first}, timeout=max(0.0, wait_s))
    if done and first.exception() is None:
        return first.result(), ""
    second = asyncio.create_task(start_again())
    if done:  # first attempt failed: the duplicate is a plain retry
        return await second, " (retried)"
    done, pending = await asyncio.wait({first, second}, return_when=asyncio.FIRST_COMPLETED)
    winner = done.pop()
    if winner.exception() is not None and pending:
        return await pending.pop(), " (hedged)"  # one failed: use the other
    for task in pending:
        _discard(task)
    return winner.result(), " (hedged)"


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llm_configured": llm_configured()}


@app.post(
    "/agent-demo",
    response_model=AgentDemoResponse,
    dependencies=[Depends(require_internal_key)],
)
async def agent_demo(body: AgentDemoRequest, request: Request) -> AgentDemoResponse:
    if not llm_configured():
        raise HTTPException(status_code=503, detail="LLM mode not configured")

    try:
        query = check_input(body.query)
    except GuardrailViolation as violation:
        logger.info("input declined: %s", violation)
        return _declined(violation.verdict, f"input screen: {violation} → declined, no model called")

    await run_in_threadpool(enforce_limits, client_ip(request))

    llm = build_llm()
    started = time.perf_counter()
    synth_task = asyncio.create_task(synthesize(llm, query))
    try:
        planner_out, query_plan = await plan(llm, query)
        plan_s = time.perf_counter() - started
        if planner_out.scope != "portfolio":
            _discard(synth_task)
            logger.info("planner declined: %s", planner_out.scope)
            return _declined(planner_out.scope, f"{query_plan.trace} · {plan_s:.1f}s")

        retrieval = retrieve(query_plan)
        synthesis, attempt_note = await _hedged(
            synth_task,
            lambda: synthesize(llm, query),
            HEDGE_AFTER_S - (time.perf_counter() - started),
        )
        synth_s = time.perf_counter() - started
        summary = check_output(synthesis.summary)
        ids, verify_note = finalize(query_plan, retrieval, synthesis)
    except GuardrailViolation as violation:
        _discard(synth_task)
        logger.warning("output declined: %s", violation)
        return _declined(violation.verdict, f"output screen: {violation} → declined")
    except Exception:
        _discard(synth_task)
        logger.exception("agent pipeline failed")
        raise HTTPException(status_code=502, detail="LLM pipeline failed")

    entries = len(knowledge_base())
    return AgentDemoResponse(
        plannerTrace=_clip(f"{query_plan.trace} · {plan_s:.1f}s"),
        retrieverTrace=_clip(retrieval.trace),
        synthesizerTrace=_clip(
            f"answered from all {entries} entries in {synth_s:.1f}s"
            f"{attempt_note}, parallel to planner · {verify_note}"
        ),
        summary=summary,
        matchedIds=ids,
    )
