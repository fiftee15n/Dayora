import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import HTTPException, Request, status

from .config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_access_token(user_id: int, token_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "ver": token_version,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def new_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_verification_code(email: str, code: str) -> str:
    """Keyed hash, so a leaked table can't be brute-forced offline (only 10^6 codes)."""
    msg = f"{email.lower()}:{code}".encode()
    return hmac.new(settings.jwt_secret.encode(), msg, hashlib.sha256).hexdigest()


class RateLimiter:
    """Simple in-memory sliding-window limiter (per client IP + route).

    Good enough for a single instance; swap for Redis when scaling horizontally.
    """

    def __init__(self, max_calls: int, per_seconds: int):
        self.max_calls = max_calls
        self.per_seconds = per_seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self._last_sweep = time.monotonic()

    def __call__(self, request: Request) -> None:
        if settings.app_env == "test":
            return
        ip = request.client.host if request.client else "unknown"
        key = f"{ip}:{request.url.path}"
        now = time.monotonic()
        self._sweep(now)
        q = self.hits[key]
        while q and now - q[0] > self.per_seconds:
            q.popleft()
        if len(q) >= self.max_calls:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again shortly.",
            )
        q.append(now)

    def _sweep(self, now: float) -> None:
        """Forget idle clients so the table doesn't grow forever."""
        if now - self._last_sweep < self.per_seconds:
            return
        self._last_sweep = now
        for key in [k for k, q in self.hits.items() if not q or now - q[-1] > self.per_seconds]:
            del self.hits[key]


auth_rate_limit = RateLimiter(max_calls=10, per_seconds=60)
