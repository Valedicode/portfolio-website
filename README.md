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
a Planner agent (`ChatAnthropic` + structured output) parses the question,
the deterministic Retriever scores the knowledge base (same weights as the
frontend's simulated tier), and a Synthesizer agent ranks the candidates and
writes the answer. It reads the same JSON knowledge base from
`frontend/data`, so both tiers answer from identical data.

```bash
cd backend
conda activate portfolio
pip install -r requirements.txt
cp .env.example .env                  # add your ANTHROPIC_API_KEY
uvicorn app.main:app --reload         # http://127.0.0.1:8000
```

```
app/
  main.py                # FastAPI app: POST /agent-demo, GET /health
  knowledge.py           # loads ../frontend/data as the shared knowledge base
  schemas.py             # pydantic models (double as LLM structured-output schemas)
  agents/
    planner.py           # LLM agent: question → QueryPlan
    retriever.py         # deterministic scoring (port of retriever.ts)
    synthesizer.py       # LLM agent: candidates → ranked answer
```

## How the two connect

The frontend proxies `/api/agent-demo` to the backend via a Next.js rewrite
(`frontend/next.config.mjs`, configurable with `AGENT_BACKEND_URL`). If the
backend is down, unreachable, slow, or has no API key, the frontend silently
falls back to its client-side rule-based pipeline — the demo never breaks,
the LLM tier only upgrades it.

## Demo modes

- **Simulated** (default): deterministic rule-based pipeline, fully
  client-side, instant. Works everywhere, no backend needed.
- **AI reasoning**: the LangChain pipeline described above. Requires the
  backend running with `ANTHROPIC_API_KEY` set.

## Configuration

| Where | Variable | Purpose |
| --- | --- | --- |
| `backend/.env` | `ANTHROPIC_API_KEY` | Enables the LangChain agents |
| `backend/.env` | `KNOWLEDGE_DIR` | Override knowledge base location (optional) |
| `frontend/.env.local` | `AGENT_BACKEND_URL` | Backend URL for the proxy (default `http://127.0.0.1:8000`) |
| `frontend/.env.local` | `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` | Formspree-style endpoint for the contact form; without it the form opens a mail draft |

## Accessibility & performance

- `prefers-reduced-motion` disables the canvas animation, stagger effects,
  and the demo's staged reveal.
- The demo section is lazy-loaded via `next/dynamic` so it doesn't block
  initial paint. The hero canvas is plain 2D canvas, no WebGL.
- Semantic landmarks, labeled inputs, `aria-live` log panel, and
  keyboard-operable controls throughout.
