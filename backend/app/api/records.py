from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from firebase_admin import firestore
from pydantic import BaseModel, Field

from app.core.firebase import get_firestore_client
from app.core.security import require_user

router = APIRouter(prefix="/api/v1/records", tags=["User Records"])
RecordKind = Literal["saved_tender", "verification_note", "other"]


class RecordCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    kind: RecordKind = "other"
    data: dict[str, Any] = Field(default_factory=dict)


class RecordUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    kind: RecordKind | None = None
    data: dict[str, Any] | None = None


def records_for(uid: str):
    return get_firestore_client().collection("users").document(uid).collection("records")


def iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else (str(value) if value is not None else None)


def serialize(snapshot) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    return {
        "id": snapshot.id,
        "title": data.get("title", ""),
        "kind": data.get("kind", "other"),
        "data": data.get("data") or {},
        "created_at": iso(data.get("createdAt")),
        "updated_at": iso(data.get("updatedAt")),
    }


@router.get("")
def list_records(user: dict[str, Any] = Depends(require_user)) -> list[dict[str, Any]]:
    query = records_for(user["uid"]).order_by("createdAt", direction=firestore.Query.DESCENDING)
    return [serialize(item) for item in query.stream()]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_record(body: RecordCreate, user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Record title cannot be blank.")
    ref = records_for(user["uid"]).document()
    ref.set({
        "title": title,
        "kind": body.kind,
        "data": body.data,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })
    return serialize(ref.get())


@router.patch("/{record_id}")
def update_record(
    record_id: str,
    body: RecordUpdate,
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    ref = records_for(user["uid"]).document(record_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="Record not found.")

    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    if "title" in updates:
        updates["title"] = updates["title"].strip()
        if not updates["title"]:
            raise HTTPException(status_code=422, detail="Record title cannot be blank.")
    if updates:
        updates["updatedAt"] = firestore.SERVER_TIMESTAMP
        ref.update(updates)
    return serialize(ref.get())


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_record(record_id: str, user: dict[str, Any] = Depends(require_user)) -> Response:
    ref = records_for(user["uid"]).document(record_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="Record not found.")
    ref.delete()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
