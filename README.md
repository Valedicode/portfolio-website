# Kevin Ha — Portfolio

Personal portfolio built around a multi-agent theme: an ambient agent-network
hero, a skills node graph, and a working **"Ask My Agents"** demo — a
Planner → Retriever → Synthesizer pipeline that answers questions about my
work and live-filters the project grid.

## Repository layout

```
frontend/   Next.js app (TypeScript, Tailwind v4, Framer Motion) — pnpm
backend/    LangChain multi-agent pipeline (Python, FastAPI) — conda
legacy/     the previous static site, kept for reference
```

## Frontend

```bash
cd frontend
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production build
pnpm lint
```

Key structure:

```
data/                    # the shared knowledge base (plain JSON)
  cv.json                #   bio, stats, education & experience entries
  projects.json          #   project entries (id, tags, description, links…)
  skills.json            #   skill categories with items
lib/knowledge.ts         # normalizes /data into one flat KnowledgeEntry list
components/agent-demo/   # structured by agent ROLE, not by data domain
  planner.ts             #   query → structured intent (tags/keywords/type/sort)
  retriever.ts           #   intent → scored candidates from the knowledge base
  synthesizer.ts         #   candidates → ranked results + summary
  pipeline.ts            #   runs the three roles; LLM engine with rules fallback
  AgentDemo.tsx          #   UI shell: input, node trace, log panel
  AgentContext.tsx       #   shares the result with ProjectGrid + Nav status
```

## Backend

The demo's **"AI reasoning"** mode is served by a Python LangChain pipeline:
a Planner agent (OpenRouter chat model + structured output) parses the question,
the deterministic Retriever scores the knowledge base (same weights as the
frontend's simulated tier), and a Synthesizer agent ranks the candidates and
writes the answer. It reads the same JSON knowledge base from
`frontend/data`, so both tiers answer from identical data.

```bash
cd backend
conda activate portfolio
pip install -r requirements.txt
cp .env.example .env                  # add your OPENROUTER_API_KEY
uvicorn app.main:app --reload         # http://127.0.0.1:8000
```

```
app/
  main.py                # FastAPI app: POST /agent-demo, GET /health
  llm.py                 # OpenRouter chat model factory (LLM_MODEL env)
  guardrail.py           # input/output guardrails + prompt fencing
  security.py            # shared-secret check, per-IP and global rate limits
  knowledge.py           # loads ../frontend/data as the shared knowledge base
  schemas.py             # pydantic models (double as LLM structured-output schemas)
  agents/
    planner.py           # LLM agent: question → QueryPlan
    retriever.py         # deterministic scoring (port of retriever.ts)
    synthesizer.py       # LLM agent: candidates → ranked answer
```

## How the two connect

The frontend proxies `/api/agent-demo` to the backend through a server route
(`frontend/app/api/agent-demo/route.ts`, configurable with `AGENT_BACKEND_URL`),
which adds a shared secret and the visitor's IP. If the backend is down,
unreachable, slow, has no API key, or blocks the request, the frontend
silently falls back to its client-side rule-based pipeline — the demo never
breaks, the LLM tier only upgrades it.

## Abuse protection

The LLM key costs money, so the public endpoint is layered (cheapest first):

1. **Shared secret** (`INTERNAL_API_KEY`): only the Next.js proxy can call the backend.
2. **Input guardrail**: rejects control characters and prompt-injection phrasing before any tokens are spent.
3. **Rate limits**: 6/min and 30/day per IP, 300/day globally, in memory (single process) or optionally Upstash Redis. Fails closed.
4. **Prompt fencing + output guardrail**: visitor text is fenced as data; summaries are capped, link-stripped and checked for prompt leaks.
5. **Hard spend cap**: use a dedicated OpenRouter key with a low credit limit.

Tests: `cd backend && python -m pytest tests`.

## Deploying

Frontend on **Vercel**, backend on **Render** as one long-running process
(no Redis needed, and Render checks out the whole repo, so the backend reads
`frontend/data` directly).

1. **OpenRouter**: create a dedicated API key with a low credit limit (the hard spend cap).
2. **Secret**: generate one long random string for `INTERNAL_API_KEY`, e.g.
   `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
3. **Backend (Render)**: New → Blueprint → this repo. `render.yaml` defines the
   service; enter `OPENROUTER_API_KEY` and `INTERNAL_API_KEY` when prompted.
   Check `https://<service>.onrender.com/health` shows `"llm_configured": true`.
4. **Frontend (Vercel)**: import the repo with root directory `frontend`, and set
   `AGENT_BACKEND_URL=https://<service>.onrender.com` and the same `INTERNAL_API_KEY`.

Render's free tier sleeps after ~15 minutes idle and takes up to a minute to
wake. The page pings the backend on load to wake it early; a visitor who asks
before it is up gets the rule-based answer. The paid Starter plan removes the
sleep entirely.

## How the demo answers

Every question goes to the LangChain pipeline described above, which writes
a conversational answer. If the backend is unavailable (asleep, rate
limited, blocked by a guardrail, or not configured), the client-side
rule-based pipeline answers instead, and the answer is marked as a quick
offline answer. The page pings the backend on load to wake it early.

## Configuration

| Where | Variable | Purpose |
| --- | --- | --- |
| `backend/.env` | `OPENROUTER_API_KEY` | Enables the LangChain agents |
| `backend/.env` | `LLM_MODEL` | OpenRouter model id (default `deepseek/deepseek-v4-flash`) |
| both `.env` files | `INTERNAL_API_KEY` | Shared secret between proxy and backend (required in production) |
| `backend/.env` | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared rate-limit counters (only for serverless or multi-instance) |
| `backend/.env` | `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY`, `GLOBAL_DAILY_CAP` | Limits (optional) |
| `backend/.env` | `KNOWLEDGE_DIR` | Override knowledge base location (optional) |
| `frontend/.env.local` | `AGENT_BACKEND_URL` | Backend URL for the proxy route (default `http://127.0.0.1:8000`) |
| `frontend/.env.local` | `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` | Formspree-style endpoint for the contact form; without it the form opens a mail draft |

## Accessibility & performance

- `prefers-reduced-motion` disables the canvas animation, stagger effects,
  and the demo's staged reveal.
- The demo section is lazy-loaded via `next/dynamic` so it doesn't block
  initial paint. The hero canvas is plain 2D canvas, no WebGL.
- Semantic landmarks, labeled inputs, `aria-live` log panel, and
  keyboard-operable controls throughout.
