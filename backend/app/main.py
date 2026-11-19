"""FastAPI app exposing the LangChain multi-agent pipeline.

POST /agent-demo runs Planner (LLM) -> Retriever (deterministic) ->
Synthesizer (LLM) over the shared knowledge base and returns per-agent
traces plus the matched project IDs.

The Next.js frontend proxies /api/agent-demo here (see
frontend/next.config.mjs) and treats any non-200 response as a signal
to fall back to its client-side rule-based pipeline — so this service
can never break the demo, only upgrade it.

Run:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_anthropic import ChatAnthropic

from .agents.planner import plan
from .agents.retriever import retrieve
from .agents.synthesizer import synthesize
from .schemas import AgentDemoRequest, AgentDemoResponse

load_dotenv()

logger = logging.getLogger("agent-demo")

MODEL = "claude-3-5-haiku-latest"
LLM_TIMEOUT_S = 10

app = FastAPI(title="Portfolio Agent Backend", version="1.0.0")

# CORS is only needed when the frontend calls this service directly
# (the default setup goes through the Next.js rewrite proxy instead).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llm_configured": bool(os.getenv("ANTHROPIC_API_KEY"))}


@app.post("/agent-demo", response_model=AgentDemoResponse)
def agent_demo(request: AgentDemoRequest) -> AgentDemoResponse:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=503, detail="LLM mode not configured")

    llm = ChatAnthropic(
        model=MODEL,
        max_tokens=600,
        temperature=0,
        timeout=LLM_TIMEOUT_S,
    )

    try:
        query_plan = plan(llm, request.query)
        retrieval = retrieve(query_plan)
        synthesis = synthesize(llm, request.query, query_plan, retrieval)
    except Exception:
        logger.exception("agent pipeline failed")
        raise HTTPException(status_code=502, detail="LLM pipeline failed")

    return AgentDemoResponse(
        plannerTrace=query_plan.trace,
        retrieverTrace=retrieval.trace,
        synthesizerTrace=synthesis.trace,
        summary=synthesis.summary,
        matchedIds=synthesis.matched_ids,
    )
