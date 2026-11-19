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
3. **Rate limits** (Upstash Redis): 5/min and 30/day per IP, 300/day globally. Fails closed.
4. **Prompt fencing + output guardrail**: visitor text is fenced as data; summaries are capped, link-stripped and checked for prompt leaks.
5. **Hard spend cap**: use a dedicated OpenRouter key with a low credit limit.

Tests: `cd backend && python -m pytest tests`.

## Deploying (Vercel)

Two Vercel projects from this repo: `frontend/` (root directory `frontend`) and
`backend/` (root directory `backend`, which carries `vercel.json` to copy
`frontend/data` in at build). Set the backend env vars from `backend/.env.example`
(including Upstash) and, on the frontend, `AGENT_BACKEND_URL` and the same
`INTERNAL_API_KEY`.

## Demo modes

- **Simulated** (default): deterministic rule-based pipeline, fully
  client-side, instant. Works everywhere, no backend needed.
- **AI reasoning**: the LangChain pipeline described above. Requires the
  backend running with `OPENROUTER_API_KEY` set.

## Configuration

| Where | Variable | Purpose |
| --- | --- | --- |
| `backend/.env` | `OPENROUTER_API_KEY` | Enables the LangChain agents |
| `backend/.env` | `LLM_MODEL` | OpenRouter model id (default `deepseek/deepseek-chat`) |
| both `.env` files | `INTERNAL_API_KEY` | Shared secret between proxy and backend |
| `backend/.env` | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate-limit counters (required in production) |
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
