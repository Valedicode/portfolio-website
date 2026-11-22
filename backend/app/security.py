"""Access control and cost protection for POST /agent-demo.

Three independent layers, checked in this order:

1. Shared secret: only the Next.js proxy knows INTERNAL_API_KEY, so direct
   hits on the public backend URL are rejected (CORS does not do this).
2. Per-IP limits (per minute and per day).
3. A global daily cap, a circuit breaker for distributed abuse.

The site owner skips layers 2 and 3 by sending ADMIN_KEY (see `is_admin`);
those requests are not counted, so testing never uses up visitors' quota.

Counters are process-local by default, which is correct for the intended
deployment: a single long-running process (Render). Upstash Redis (REST) is
optional and only needed when the backend runs as multiple instances or on
serverless, where in-memory counts would be split and reset; on Vercel the
backend refuses to run without it. Any limiter failure fails closed: the
frontend falls back to its free rule-based pipeline, so being strict costs
nothing.
"""

from __future__ import annotations

import hmac
import logging
import os
import threading
import time
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, Request

logger = logging.getLogger("agent-demo.security")

MINUTE_S = 60
DAY_S = 24 * 60 * 60


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def is_production() -> bool:
    """True on a hosting platform (each sets its own marker env var)."""
    return bool(os.getenv("RENDER") or os.getenv("VERCEL"))


def require_internal_key(request: Request) -> None:
    """Rejects requests that did not come through the Next.js proxy."""
    expected = os.getenv("INTERNAL_API_KEY", "")
    if not expected:
        # Unset key == open endpoint. Only acceptable outside production.
        if is_production():
            raise HTTPException(status_code=503, detail="Backend not configured")
        return
    given = request.headers.get("x-internal-key", "")
    if not hmac.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


def is_admin(request: Request) -> bool:
    """True when the request carries ADMIN_KEY: the site owner skips the limits.

    Unset key == no admin. A wrong key is simply a normal, limited visitor.
    The OpenRouter credit limit still caps what an admin can spend.
    """
    expected = os.getenv("ADMIN_KEY", "")
    given = request.headers.get("x-admin-key", "")
    return bool(expected) and hmac.compare_digest(given.encode(), expected.encode())


def client_ip(request: Request) -> str:
    """IP forwarded by the proxy. Trusted only because the secret was checked."""
    forwarded = request.headers.get("x-client-ip", "").strip()
    return forwarded[:64] or (request.client.host if request.client else "unknown")


class _MemoryCounter:
    """Process-local fixed-window counters (local development only)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: dict[str, tuple[int, float]] = {}

    def incr(self, key: str, ttl: int) -> int:
        now = time.monotonic()
        with self._lock:
            count, expires = self._data.get(key, (0, 0.0))
            if now >= expires:
                count, expires = 0, now + ttl
            count += 1
            self._data[key] = (count, expires)
            return count


class _UpstashCounter:
    """Fixed-window counters over Upstash's REST pipeline endpoint."""

    def __init__(self, url: str, token: str) -> None:
        self._url = url.rstrip("/") + "/pipeline"
        self._headers = {"Authorization": f"Bearer {token}"}

    def incr(self, key: str, ttl: int) -> int:
        res = httpx.post(
            self._url,
            headers=self._headers,
            json=[["INCR", key], ["EXPIRE", key, ttl, "NX"]],
            timeout=3,
        )
        res.raise_for_status()
        return int(res.json()[0]["result"])


_memory = _MemoryCounter()


def _counter() -> _MemoryCounter | _UpstashCounter:
    url = os.getenv("UPSTASH_REDIS_REST_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
    if url and token:
        return _UpstashCounter(url, token)
    if os.getenv("VERCEL"):
        raise RuntimeError("Upstash is required on serverless")
    return _memory


def enforce_limits(ip: str) -> None:
    """Raises 429/503 when a limit is exceeded or the limiter is unavailable."""
    per_min = _int_env("RATE_LIMIT_PER_MINUTE", 6)
    per_day = _int_env("RATE_LIMIT_PER_DAY", 30)
    global_day = _int_env("GLOBAL_DAILY_CAP", 300)
    today = datetime.now(timezone.utc).strftime("%Y%m%d")

    try:
        counter = _counter()
        if counter.incr(f"rl:min:{ip}", MINUTE_S) > per_min:
            raise HTTPException(status_code=429, detail="Too many requests")
        if counter.incr(f"rl:day:{today}:{ip}", DAY_S) > per_day:
            raise HTTPException(status_code=429, detail="Daily limit reached")
        if counter.incr(f"rl:global:{today}", DAY_S) > global_day:
            raise HTTPException(status_code=503, detail="Daily capacity reached")
    except HTTPException:
        raise
    except Exception:
        logger.exception("rate limiter unavailable, failing closed")
        raise HTTPException(status_code=503, detail="Limiter unavailable")
