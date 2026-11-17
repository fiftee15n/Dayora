import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response, UploadFile
from sqlalchemy import select

from ..config import settings
from ..deps import DB, CurrentUser, log_activity
from ..models import User
from ..schemas import PasswordChange, ProfileUpdate, UserOut
from ..security import hash_password, verify_password

router = APIRouter(prefix="/api/users", tags=["users"])

_IMAGE_SIGNATURES = {
    b"\x89PNG\r\n\x1a\n": ".png",
    b"\xff\xd8\xff": ".jpg",
    b"GIF87a": ".gif",
    b"GIF89a": ".gif",
}


def _detect_ext(head: bytes) -> str | None:
    for sig, ext in _IMAGE_SIGNATURES.items():
        if head.startswith(sig):
            return ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    return None


@router.patch("/me", response_model=UserOut)
def update_profile(data: ProfileUpdate, user: CurrentUser, db: DB):
    if data.email and data.email.lower() != user.email:
        if db.scalar(select(User).where(User.email == data.email.lower())):
            raise HTTPException(status_code=409, detail="Email already in use")
        user.email = data.email.lower()
    if data.name is not None:
        user.name = data.name.strip()
    if data.currency is not None:
        user.currency = data.currency.upper()
    log_activity(db, user, "updated", "account", "Profile updated")
    db.commit()
    return user


@router.post("/me/password", status_code=204)
def change_password(data: PasswordChange, user: CurrentUser, db: DB):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = hash_password(data.new_password)
    log_activity(db, user, "updated", "account", "Password changed")
    db.commit()


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(file: UploadFile, user: CurrentUser, db: DB):
    content = await file.read(settings.max_avatar_bytes + 1)
    if len(content) > settings.max_avatar_bytes:
        raise HTTPException(status_code=413, detail="Image must be 2 MB or smaller")
    ext = _detect_ext(content[:16])
    if not ext:
        raise HTTPException(status_code=415, detail="Please upload a PNG, JPEG, GIF or WebP image")

    folder = Path(settings.upload_dir) / "avatars"
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{user.id}_{uuid.uuid4().hex}{ext}"
    (folder / name).write_bytes(content)

    if user.avatar_url and user.avatar_url.startswith("/uploads/avatars/"):
        old = folder / Path(user.avatar_url).name
        old.unlink(missing_ok=True)
    user.avatar_url = f"/uploads/avatars/{name}"
    db.commit()
    return user


@router.delete("/me", status_code=204)
def delete_account(response: Response, user: CurrentUser, db: DB):
    db.delete(user)
    db.commit()
    response.delete_cookie(settings.cookie_name, path="/")
