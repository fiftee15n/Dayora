from fastapi import APIRouter, Query
from sqlalchemy import select

from ..deps import DB, CurrentUser, get_owned, log_activity
from ..models import Note
from ..schemas import NoteIn, NoteOut, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("", response_model=list[NoteOut])
def list_notes(
    user: CurrentUser,
    db: DB,
    q: str | None = Query(default=None, max_length=100),
    category: str | None = None,
    archived: bool = False,
    pinned: bool | None = None,
):
    stmt = select(Note).where(Note.user_id == user.id, Note.archived.is_(archived))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Note.title.ilike(like) | Note.content.ilike(like))
    if category:
        stmt = stmt.where(Note.category == category)
    if pinned is not None:
        stmt = stmt.where(Note.pinned.is_(pinned))
    return db.scalars(stmt.order_by(Note.pinned.desc(), Note.updated_at.desc()).limit(500)).all()


@router.get("/categories", response_model=list[str])
def note_categories(user: CurrentUser, db: DB):
    return [
        c
        for c in db.scalars(
            select(Note.category)
            .where(Note.user_id == user.id, Note.category.is_not(None))
            .distinct()
            .order_by(Note.category)
        ).all()
        if c
    ]


@router.post("", response_model=NoteOut, status_code=201)
def create_note(data: NoteIn, user: CurrentUser, db: DB):
    note = Note(user_id=user.id, **data.model_dump())
    db.add(note)
    db.flush()
    log_activity(db, user, "created", "note", f"Created note “{note.title or 'Untitled'}”", note.id)
    db.commit()
    db.refresh(note)
    return note


@router.get("/{note_id}", response_model=NoteOut)
def get_note(note_id: int, user: CurrentUser, db: DB):
    return get_owned(db, Note, note_id, user)


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, data: NoteUpdate, user: CurrentUser, db: DB):
    """Used by autosave, so content edits are intentionally not written to the activity log."""
    note = get_owned(db, Note, note_id, user)
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if value is None and key not in {"category"}:
            continue
        setattr(note, key, value)
    if changes.get("archived") is True:
        log_activity(db, user, "archived", "note", f"Archived note “{note.title}”", note.id)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int, user: CurrentUser, db: DB):
    note = get_owned(db, Note, note_id, user)
    log_activity(db, user, "deleted", "note", f"Deleted note “{note.title}”", note.id)
    db.delete(note)
    db.commit()
