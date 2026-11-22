/**
 * Server-side proxy to the Python LangChain backend (../backend).
 *
 * Runs on the server so the backend URL and the shared secret never reach the
 * browser. It forwards the visitor's IP (for the backend's rate limiter) and
 * `X-Internal-Key` (so only this proxy can call the backend). Any failure
 * becomes a non-200, which makes the client fall back to its rule-based
 * pipeline.
 */
const BACKEND_URL = process.env.AGENT_BACKEND_URL ?? "http://127.0.0.1:8000";
// Two sequential LLM calls of up to 12s each (backend/app/llm.py) plus overhead.
const BACKEND_TIMEOUT_MS = 28_000;

/** Vercel function limit in seconds; must exceed BACKEND_TIMEOUT_MS. */
export const maxDuration = 30;
const MAX_BODY_CHARS = 1_000;

function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}

/**
 * Warm-up ping. The free backend host sleeps when idle and takes a while to
 * wake, so the demo calls this on page load: by the time a visitor asks a
 * question, the backend is usually up. Hits only the free /health endpoint.
 */
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      cache: "no-store",
    });
    return Response.json({ awake: res.ok }, { status: res.ok ? 200 : 503 });
  } catch {
    return Response.json({ awake: false }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return Response.json({ detail: "Payload too large" }, { status: 413 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client-IP": clientIp(request),
  };
  const key = process.env.INTERNAL_API_KEY;
  if (key) headers["X-Internal-Key"] = key;
  // The owner's browser sends this; the backend checks it and skips the limits.
  const adminKey = request.headers.get("x-admin-key");
  if (adminKey) headers["X-Admin-Key"] = adminKey;

  try {
    const upstream = await fetch(`${BACKEND_URL}/agent-demo`, {
      method: "POST",
      headers,
      body: raw,
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}
