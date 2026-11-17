import hashlib
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


def new_reset_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash). Only the hash is stored."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_reset_token(raw)


def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class RateLimiter:
    """Simple in-memory sliding-window limiter (per client IP + route).

    Good enough for a single instance; swap for Redis when scaling horizontally.
    """

    def __init__(self, max_calls: int, per_seconds: int):
        self.max_calls = max_calls
        self.per_seconds = per_seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        if settings.app_env == "test":
            return
        ip = request.client.host if request.client else "unknown"
        key = f"{ip}:{request.url.path}"
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.per_seconds:
            q.popleft()
        if len(q) >= self.max_calls:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again shortly.",
            )
        q.append(now)


auth_rate_limit = RateLimiter(max_calls=10, per_seconds=60)
