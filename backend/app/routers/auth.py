import hmac
import re
import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy import select

from ..config import settings
from ..deps import DB, CurrentUser, log_activity
from ..google_auth import GoogleNotConfigured, GoogleTokenError, verify_google_id_token
from ..mailer import deliver, send_password_reset_code, send_verification_code
from ..models import ExpenseCategory, PasswordResetToken, PendingSignup, TaskCategory, User, utcnow
from ..schemas import (
    AuthOut,
    ForgotPasswordIn,
    GoogleSignInIn,
    LoginIn,
    RegisterIn,
    ResetPasswordIn,
    SignupResendIn,
    SignupStartIn,
    SignupStartOut,
    SignupVerifyIn,
    UserOut,
)
from ..security import (
    auth_rate_limit,
    create_access_token,
    hash_password,
    hash_verification_code,
    new_verification_code,
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
    ("Fitness", "#F97316"),
]
DEFAULT_EXPENSE_CATEGORIES = [
    ("Food & Groceries", "#F59E0B", "utensils"),
    ("Restaurant", "#F97316", "utensils"),
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
    """One-step sign-up without email verification (used by the web app)."""
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = _create_user(db, name=data.name.strip(), email=email, hashed_password=hash_password(data.password))
    db.commit()
    db.refresh(user)
    return _issue(response, user)


def _create_user(db, *, name: str, email: str, hashed_password: str, google_sub: str | None = None) -> User:
    user = User(name=name, email=email, hashed_password=hashed_password, google_sub=google_sub)
    db.add(user)
    db.flush()
    _seed_defaults(db, user)
    log_activity(db, user, "created", "account", "Welcome to Dayora! Account created.")
    # A half-finished email sign-up for this address is no longer needed.
    pending = db.scalar(select(PendingSignup).where(PendingSignup.email == email))
    if pending:
        db.delete(pending)
    return user


def _name_from_email(email: str) -> str:
    """"sara.ahmed@x.com" -> "Sara Ahmed" (the name can be changed later in Settings)."""
    local = email.split("@", 1)[0]
    words = [w for w in re.split(r"[._\-+]+", re.sub(r"\d+", "", local)) if w]
    return " ".join(w.capitalize() for w in words)[:120] or local[:120] or "Dayora user"


# ---------------------------------------------------------------- sign-up with an emailed code


def _seconds_until_resend(pending: PendingSignup) -> int:
    elapsed = (utcnow() - pending.sent_at).total_seconds()
    return max(0, int(settings.verification_resend_seconds - elapsed + 0.999))


def _send_new_code(pending: PendingSignup, background: BackgroundTasks) -> str:
    code = new_verification_code()
    pending.code_hash = hash_verification_code(pending.email, code)
    pending.expires_at = utcnow() + timedelta(minutes=settings.verification_code_expire_minutes)
    pending.sent_at = utcnow()
    pending.attempts = 0
    deliver(background, send_verification_code, pending.email, code, settings.verification_code_expire_minutes)
    return code


def _start_out(pending: PendingSignup, code: str | None) -> SignupStartOut:
    return SignupStartOut(
        message=f"We sent a 6-digit code to {pending.email}.",
        email=pending.email,
        expires_in=max(0, int((pending.expires_at - utcnow()).total_seconds())),
        resend_in=_seconds_until_resend(pending),
        # Without an email provider in development, hand the code back so the flow can be tested.
        dev_code=code if code and settings.is_dev and not settings.email_enabled else None,
    )


@router.post("/signup/start", response_model=SignupStartOut, dependencies=[Depends(auth_rate_limit)])
def signup_start(data: SignupStartIn, db: DB, background: BackgroundTasks):
    """Step 1: remember the details and email a 6-digit code. The account is created on verify."""
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    name = (data.name or "").strip() or _name_from_email(email)
    pending = db.scalar(select(PendingSignup).where(PendingSignup.email == email))
    code = None
    if pending is None:
        pending = PendingSignup(email=email, name=name, hashed_password=hash_password(data.password))
        db.add(pending)
        code = _send_new_code(pending, background)
    else:
        pending.name = name
        pending.hashed_password = hash_password(data.password)
        # Pressing "Create account" again shortly after doesn't spam the inbox; the last code still works.
        if _seconds_until_resend(pending) == 0 or pending.expires_at < utcnow():
            code = _send_new_code(pending, background)
    db.commit()
    return _start_out(pending, code)


@router.post("/signup/resend", response_model=SignupStartOut, dependencies=[Depends(auth_rate_limit)])
def signup_resend(data: SignupResendIn, db: DB, background: BackgroundTasks):
    pending = db.scalar(select(PendingSignup).where(PendingSignup.email == data.email.lower()))
    if not pending:
        raise HTTPException(status_code=404, detail="No sign-up in progress for this email. Please start again.")
    wait = _seconds_until_resend(pending)
    if wait:
        raise HTTPException(status_code=429, detail=f"Please wait {wait} seconds before requesting a new code.")
    code = _send_new_code(pending, background)
    db.commit()
    return _start_out(pending, code)


@router.post(
    "/signup/verify",
    response_model=AuthOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(auth_rate_limit)],
)
def signup_verify(data: SignupVerifyIn, response: Response, db: DB):
    """Step 2: check the code and create the account."""
    email = data.email.lower()
    pending = db.scalar(select(PendingSignup).where(PendingSignup.email == email))
    if not pending:
        raise HTTPException(status_code=400, detail="No sign-up in progress for this email. Please start again.")
    if pending.attempts >= settings.verification_max_attempts:
        raise HTTPException(status_code=400, detail="Too many wrong codes. Request a new code.")
    if pending.expires_at < utcnow():
        raise HTTPException(status_code=400, detail="This code has expired. Request a new code.")
    if not hmac.compare_digest(hash_verification_code(email, data.code), pending.code_hash):
        pending.attempts += 1
        db.commit()
        left = settings.verification_max_attempts - pending.attempts
        detail = f"That code isn't right. {left} attempt{'s' if left != 1 else ''} left." if left else (
            "Too many wrong codes. Request a new code."
        )
        raise HTTPException(status_code=400, detail=detail)
    if db.scalar(select(User).where(User.email == email)):
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = _create_user(db, name=pending.name, email=email, hashed_password=pending.hashed_password)
    db.commit()
    db.refresh(user)
    return _issue(response, user)


# ---------------------------------------------------------------- Google sign-in


@router.post("/google", response_model=AuthOut, dependencies=[Depends(auth_rate_limit)])
def google_sign_in(data: GoogleSignInIn, response: Response, db: DB):
    """Sign in (or sign up) with a Google ID token obtained by the app."""
    try:
        identity = verify_google_id_token(data.id_token)
    except GoogleNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except GoogleTokenError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    user = db.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == identity.email))
        if user is not None:
            # Google has verified this address, so it's safe to link it to the existing account.
            user.google_sub = identity.sub
            log_activity(db, user, "updated", "account", "Google sign-in linked")
        else:
            user = _create_user(
                db,
                name=identity.name[:120] or _name_from_email(identity.email),
                email=identity.email,
                # No password yet; "Forgot password" can set one later.
                hashed_password=hash_password(secrets.token_urlsafe(32)),
                google_sub=identity.sub,
            )
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
    """Email a 6-digit code for resetting the password (entered in the app)."""
    msg = {"message": "If that email is registered, we've sent a 6-digit code to it."}
    email = data.email.lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        return msg
    # Only the newest code works.
    for old in db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False)
        )
    ):
        old.used = True
    db.flush()
    code = new_verification_code()
    hashed = hash_verification_code(email, f"reset:{code}")
    while db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hashed)):
        code = new_verification_code()  # vanishingly rare repeat of an older code
        hashed = hash_verification_code(email, f"reset:{code}")
    minutes = settings.reset_token_expire_minutes
    db.add(
        PasswordResetToken(
            user_id=user.id, token_hash=hashed, expires_at=utcnow() + timedelta(minutes=minutes)
        )
    )
    db.commit()
    deliver(background, send_password_reset_code, user.email, user.name, code, minutes)
    # Without an email provider in development, hand the code back so the flow can be tested.
    if settings.is_dev and not settings.email_enabled:
        msg["dev_reset_code"] = code
    return msg


@router.post("/reset-password", dependencies=[Depends(auth_rate_limit)])
def reset_password(data: ResetPasswordIn, db: DB):
    email = data.email.lower()
    invalid = HTTPException(status_code=400, detail="This code is invalid or has expired. Request a new one.")
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        raise invalid
    row = db.scalar(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False))
        .order_by(PasswordResetToken.id.desc())
        .limit(1)
    )
    if not row or row.expires_at < utcnow():
        raise invalid
    if (row.attempts or 0) >= settings.verification_max_attempts:
        raise HTTPException(status_code=400, detail="Too many wrong codes. Request a new one.")
    if not hmac.compare_digest(hash_verification_code(email, f"reset:{data.code}"), row.token_hash):
        row.attempts = (row.attempts or 0) + 1
        db.commit()
        left = settings.verification_max_attempts - row.attempts
        raise HTTPException(
            status_code=400,
            detail=f"That code isn't right. {left} attempt{'s' if left != 1 else ''} left."
            if left
            else "Too many wrong codes. Request a new one.",
        )
    user.hashed_password = hash_password(data.new_password)
    user.token_version += 1  # sign out other sessions
    row.used = True
    log_activity(db, user, "updated", "account", "Password was reset")
    db.commit()
    return {"message": "Password updated. You can now sign in."}
