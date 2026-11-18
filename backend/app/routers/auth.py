from datetime import timedelta
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy import select

from ..config import settings
from ..deps import DB, CurrentUser, log_activity
from ..mailer import send_password_reset
from ..models import ExpenseCategory, PasswordResetToken, TaskCategory, User, utcnow
from ..schemas import (
    AuthOut,
    ForgotPasswordIn,
    LoginIn,
    RegisterIn,
    ResetPasswordIn,
    UserOut,
)
from ..security import (
    auth_rate_limit,
    create_access_token,
    hash_password,
    hash_reset_token,
    new_reset_token,
    verify_password,
)

# Verified against when the email is unknown, so failed logins take the same time either way.
_DUMMY_HASH = hash_password("dayora-timing-equaliser-0")

router = APIRouter(prefix="/api/auth", tags=["auth"])

DEFAULT_TASK_CATEGORIES = [
    ("Personal", "#6366F1"),
    ("Work", "#8B5CF6"),
    ("Study", "#0EA5E9"),
    ("Health", "#10B981"),
]
DEFAULT_EXPENSE_CATEGORIES = [
    ("Food & Groceries", "#F59E0B", "utensils"),
    ("Transportation", "#0EA5E9", "car"),
    ("Shopping", "#EC4899", "shopping-bag"),
    ("Education", "#6366F1", "graduation-cap"),
    ("Healthcare", "#10B981", "heart-pulse"),
    ("Entertainment", "#8B5CF6", "film"),
    ("Bills & Utilities", "#EF4444", "receipt"),
    ("Other", "#64748B", "circle"),
]
DEFAULT_INCOME_CATEGORIES = [
    ("Salary", "#10B981", "briefcase"),
    ("Freelance", "#6366F1", "laptop"),
    ("Gifts", "#EC4899", "gift"),
    ("Other Income", "#64748B", "circle"),
]


def _seed_defaults(db, user: User) -> None:
    for name, color in DEFAULT_TASK_CATEGORIES:
        db.add(TaskCategory(user_id=user.id, name=name, color=color))
    for name, color, icon in DEFAULT_EXPENSE_CATEGORIES:
        db.add(ExpenseCategory(user_id=user.id, name=name, kind="expense", color=color, icon=icon))
    for name, color, icon in DEFAULT_INCOME_CATEGORIES:
        db.add(ExpenseCategory(user_id=user.id, name=name, kind="income", color=color, icon=icon))


def _issue(response: Response, user: User) -> AuthOut:
    token = create_access_token(user.id, user.token_version)
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    return AuthOut(user=UserOut.model_validate(user), access_token=token)


@router.post(
    "/register",
    response_model=AuthOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(auth_rate_limit)],
)
def register(data: RegisterIn, response: Response, db: DB):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(name=data.name.strip(), email=email, hashed_password=hash_password(data.password))
    db.add(user)
    db.flush()
    _seed_defaults(db, user)
    log_activity(db, user, "created", "account", "Welcome to Dayora! Account created.")
    db.commit()
    db.refresh(user)
    return _issue(response, user)


@router.post("/login", response_model=AuthOut, dependencies=[Depends(auth_rate_limit)])
def login(data: LoginIn, response: Response, db: DB):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if not user:
        verify_password(data.password, _DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _issue(response, user)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(settings.cookie_name, path="/")


@router.post("/logout-all", status_code=204)
def logout_all(response: Response, user: CurrentUser, db: DB):
    """Invalidate every token issued for this user (all devices)."""
    user.token_version += 1
    db.commit()
    response.delete_cookie(settings.cookie_name, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/forgot-password", dependencies=[Depends(auth_rate_limit)])
def forgot_password(data: ForgotPasswordIn, db: DB, background: BackgroundTasks):
    msg = {"message": "If that email is registered, a reset link has been sent."}
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if not user:
        return msg
    # Only the newest link should work.
    for old in db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False)
        )
    ):
        old.used = True
    raw, hashed = new_reset_token()
    minutes = settings.reset_token_expire_minutes
    db.add(
        PasswordResetToken(
            user_id=user.id, token_hash=hashed, expires_at=utcnow() + timedelta(minutes=minutes)
        )
    )
    db.commit()
    link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={quote(raw)}"
    background.add_task(send_password_reset, user.email, user.name, link, minutes)
    # In development the token is also returned so the flow works without an email provider.
    if settings.is_dev:
        msg["dev_reset_token"] = raw
    return msg


@router.post("/reset-password", dependencies=[Depends(auth_rate_limit)])
def reset_password(data: ResetPasswordIn, db: DB):
    row = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_reset_token(data.token))
    )
    if not row or row.used or row.expires_at < utcnow():
        raise HTTPException(status_code=400, detail="Reset link is invalid or has expired")
    user = db.get(User, row.user_id)
    user.hashed_password = hash_password(data.new_password)
    user.token_version += 1  # sign out other sessions
    row.used = True
    log_activity(db, user, "updated", "account", "Password was reset")
    db.commit()
    return {"message": "Password updated. You can now sign in."}
