from datetime import date, datetime, time, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import ActivityLog, User, utcnow
from .security import decode_access_token

DB = Annotated[Session, Depends(get_db)]

_unauthorized = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get(settings.cookie_name)


def get_current_user(request: Request, db: DB) -> User:
    token = _extract_token(request)
    if not token:
        raise _unauthorized
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized
    user = db.get(User, user_id)
    if not user or payload.get("ver", 0) != user.token_version:
        raise _unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def log_activity(
    db: Session,
    user: User,
    action: str,
    entity_type: str,
    description: str,
    entity_id: int | None = None,
) -> None:
    db.add(
        ActivityLog(
            user_id=user.id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            description=description[:255],
        )
    )


def get_owned(db: Session, model, obj_id: int, user: User):
    """Fetch a row that belongs to the user, or 404 (never leak other users' data)."""
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "user_id", None) != user.id:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return obj


class Clock:
    """The user's local clock, derived from the `X-TZ-Offset` header (minutes east of UTC).

    All datetimes are stored as naive UTC; this converts "the user's today" to UTC ranges.
    """

    def __init__(self, offset_minutes: int = 0):
        self.offset = timedelta(minutes=max(-840, min(840, offset_minutes)))

    @property
    def now_utc(self) -> datetime:
        return utcnow()

    @property
    def now_local(self) -> datetime:
        return utcnow() + self.offset

    @property
    def today(self) -> date:
        return self.now_local.date()

    def day_start_utc(self, d: date) -> datetime:
        return datetime.combine(d, time.min) - self.offset

    def local_date(self, dt_utc: datetime) -> date:
        return (dt_utc + self.offset).date()


def get_clock(x_tz_offset: Annotated[int, Header()] = 0) -> Clock:
    return Clock(x_tz_offset)


ClockDep = Annotated[Clock, Depends(get_clock)]
