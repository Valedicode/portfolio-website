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

The demo is served by a Python LangChain pipeline over the same JSON
knowledge base as the frontend (`frontend/data`), so both tiers answer from
identical data.

```
input screen (regex, instant: injection, clearly harmful requests)
    │
    ├── Planner (LLM, 4 short fields)  ──  Retriever (deterministic)
    │     router + semantic guard            exact tag/type matches
    │                                               │
    └── Synthesizer (LLM, whole KB) ────────────────┴── Verifier (deterministic)
          starts at the same time                      grounds ids, orders, screens output
```

- **Planner and Synthesizer run in parallel**, so an answer costs one LLM round
  trip, not two. The Planner's output is tiny, so it always finishes first and
  never adds latency. If it rules a question off-topic or harmful, the
  Synthesizer's draft is cancelled and a fixed refusal is sent; model-written
  text never reaches the visitor for those.
- **The Synthesizer reads the whole knowledge base** (~3k tokens) instead of a
  lossy keyword-filtered subset; the knowledge base is small enough that
  filtering only loses answers.
- **The Verifier is code, not a model**: it drops invented project ids, adds
  projects the answer names but did not list, adds exact tag matches the model
  left out, and orders by the real complexity/year fields.
- **Log traces are written by code** from structured fields (output tokens are
  latency), and a **hedged request** re-sends a Synthesizer call that is slower
  than 3s or failed, keeping whichever answers first.

### Evaluation

`backend/evals` scores the pipeline against the strongest simple alternative:
**one zero-shot call with the whole knowledge base in the prompt**, same model
and settings. 23 portfolio questions (expected projects, top result, names that
must appear) and 10 that must be refused (off-topic, injection, harmful,
including 3 harmful ones that avoid every filter keyword).

| | portfolio | refused | median answer | refusals | cost / question |
| --- | --- | --- | --- | --- | --- |
| this pipeline | 23/23 | 10/10 | 1.8s | 0.3s | $0.00025 |
| zero-shot call | 23/23 | 10/10 | 1.5s | 1.1s | $0.00029 |

Accuracy is equal on this set; answers take ~0.3s longer (they are slightly
richer, and two parallel calls wait for the slower one), while refusals are 3-4x
faster and ~15% cheaper overall, since clearly harmful input never reaches a
model. What the numbers do not show: refusals are fixed text rather than
model-written, and the project grid is verified against the data. The first
version of this pipeline (sequential Planner → keyword Retriever → Synthesizer)
scored 15/16 at a 7.0s median, which is what motivated this design. Latency
varies by about ±0.5s between runs with the provider.

```bash
python -m evals.run                     # ~2 cents of OpenRouter credit
python -m evals.run --engines pipeline --only bomb,fastapi
```

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
  guardrail.py           # input/output screens, fixed refusals, prompt fencing
  security.py            # shared-secret check, per-IP and global rate limits
  knowledge.py           # loads ../frontend/data as the shared knowledge base
  schemas.py             # pydantic models (double as LLM structured-output schemas)
  agents/
    planner.py           # LLM agent: scope (guard) + intent
    retriever.py         # deterministic scoring (port of retriever.ts)
    synthesizer.py       # LLM agent: whole knowledge base → answer + project ids
    verifier.py          # deterministic grounding and ordering of the result
evals/
  cases.json             # 26 questions with expected results
  baseline.py            # the zero-shot single-call baseline
  run.py                 # scores both engines: accuracy, refusals, latency, cost
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
2. **Input screen**: invalid text, prompt-injection phrasing and clearly harmful requests (weapons, explosives, drugs, violence, cybercrime, fraud, sexual content involving minors) get a fixed refusal before any tokens are spent; self-harm messages get a refusal that points to a crisis line.
3. **Rate limits**: 6/min and 30/day per IP, 300/day globally, in memory (single process) or optionally Upstash Redis. Fails closed.
4. **Semantic guard**: the Planner classifies every question as portfolio, off-topic, harmful or self-harm; anything but portfolio gets a fixed refusal.
5. **Prompt fencing + output screen**: visitor text is fenced as data; answers are capped, stripped of links and markdown, and checked for prompt leaks and harmful content.
6. **Hard spend cap**: use a dedicated OpenRouter key with a low credit limit.

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
